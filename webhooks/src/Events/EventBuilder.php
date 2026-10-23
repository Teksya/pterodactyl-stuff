<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Pterodactyl\Events\Server\OperationCompleted;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** Turns what the panel reports into WebhookEvents. */
final readonly class EventBuilder
{
    public function __construct(private DescriptionRenderer $renderer) {}

    /** An activity log entry, once its subjects are written. Null for entries the panel hides. */
    public function fromActivity(ActivityLog $log): ?WebhookEvent
    {
        if (in_array($log->event, ActivityLog::DISABLED_EVENTS, true)) {
            return null;
        }

        $log->loadMissing(['subjects.subject', 'actor']);

        $server = null;
        $userIds = [];
        $subjects = [];
        foreach ($log->subjects as $subject) {
            $model = $subject->subject;
            if ($model instanceof Server) {
                $server ??= $model;
            } elseif ($model instanceof User) {
                $userIds[] = (int) $model->id;
                $subjects[] = ['type' => 'user', 'id' => (int) $model->id, 'name' => (string) $model->username];
            } elseif ($model instanceof Model) {
                $subjects[] = $this->subject($model);
            }
        }

        $actor = $log->actor;
        if ($actor instanceof User && (str_starts_with($log->event, 'user:') || str_starts_with($log->event, 'auth:'))) {
            $userIds[] = (int) $actor->id;
        }

        $properties = $log->properties->all();
        $definition = EventCatalog::definition($log->event);

        return new WebhookEvent(
            key: $log->event,
            occurredAt: CarbonImmutable::parse($log->timestamp),
            description: $this->renderer->render($log->event, $properties, $log->description ?: $definition->label),
            actor: $this->actor($actor),
            ip: $log->ip ?: null,
            server: $server instanceof Server ? $this->server($server) : null,
            userIds: array_values(array_unique($userIds)),
            subjects: $subjects,
            properties: $properties,
        );
    }

    /** A completed server operation. Backups are left to their activity entries, which name the backup. */
    public function fromOperation(OperationCompleted $operation): ?WebhookEvent
    {
        $key = match ($operation->operation) {
            'provision' => 'server:provisioned',
            'delete' => 'server:deleted',
            'install' => $operation->successful ? 'server:install.completed' : 'server:install.failed',
            'reinstall' => $operation->successful ? 'server:reinstall.completed' : 'server:reinstall.failed',
            'suspend' => 'server:suspended',
            'unsuspend' => 'server:unsuspended',
            'transfer' => $operation->successful ? 'server:transfer.completed' : 'server:transfer.failed',
            default => null,
        };
        if ($key === null) {
            return null;
        }

        $server = Server::query()->where('uuid', $operation->serverUuid)->first();
        if (! $server instanceof Server) {
            return new WebhookEvent(
                key: $key,
                occurredAt: CarbonImmutable::now(),
                description: sprintf('The server %s was deleted.', $operation->serverUuid),
                properties: ['server_uuid' => $operation->serverUuid],
            );
        }

        $data = $this->server($server);
        $name = $data['name'];

        return $this->forServer($server, $key, match ($key) {
            'server:provisioned' => sprintf('Wings created the server %s.', $name),
            'server:install.completed' => sprintf('The installation of %s finished.', $name),
            'server:install.failed' => sprintf('The installation of %s failed.', $name),
            'server:reinstall.completed' => sprintf('The reinstall of %s finished.', $name),
            'server:reinstall.failed' => sprintf('The reinstall of %s failed.', $name),
            'server:suspended' => sprintf('%s was suspended.', $name),
            'server:unsuspended' => sprintf('%s was unsuspended.', $name),
            'server:transfer.completed' => sprintf('%s was transferred to the node %s.', $name, $data['node']['name']),
            default => sprintf('The transfer of %s failed.', $name),
        });
    }

    /** @param array<string, mixed> $properties */
    public function forServer(Server $server, string $key, string $description, array $properties = []): WebhookEvent
    {
        return new WebhookEvent(
            key: $key,
            occurredAt: CarbonImmutable::now(),
            description: $description,
            server: $this->server($server),
            properties: $properties,
        );
    }

    /** @param array<string, mixed> $properties */
    public function forNode(Node $node, string $key, string $description, array $properties = []): WebhookEvent
    {
        return new WebhookEvent(
            key: $key,
            occurredAt: CarbonImmutable::now(),
            description: $description,
            subjects: [$this->subject($node)],
            properties: ['node_id' => (int) $node->id, 'node' => (string) $node->name, 'fqdn' => (string) $node->fqdn, ...$properties],
        );
    }

    /** @param array<string, mixed> $properties */
    public function system(string $key, string $description, array $properties = []): WebhookEvent
    {
        return new WebhookEvent(key: $key, occurredAt: CarbonImmutable::now(), description: $description, properties: $properties);
    }

    /** What the Test button sends: a server endpoint's own server, so templates have something to show. */
    public function test(?Server $server, ?User $actor): WebhookEvent
    {
        return new WebhookEvent(
            key: EventCatalog::TEST,
            occurredAt: CarbonImmutable::now(),
            description: sprintf('This is a test delivery from %s. Your webhook works.', (string) config('app.name', 'Pterodactyl')),
            actor: $this->actor($actor),
            server: $server instanceof Server ? $this->server($server) : null,
            test: true,
        );
    }

    /** @return array{id: int, uuid: string, identifier: string, name: string, url: string, owner_id: int, node: array{id: int, name: string}} */
    public function server(Server $server): array
    {
        $server->loadMissing('node');
        $identifier = (string) $server->uuidShort;

        return [
            'id' => (int) $server->id,
            'uuid' => (string) $server->uuid,
            'identifier' => $identifier,
            'name' => (string) $server->name,
            'url' => rtrim((string) config('app.url'), '/').'/server/'.$identifier,
            'owner_id' => (int) $server->owner_id,
            'node' => ['id' => (int) $server->node_id, 'name' => (string) ($server->node->name ?? '')],
        ];
    }

    /** @return array{type: string, id?: int, uuid?: string, username?: string, email?: string, root_admin?: bool} */
    private function actor(?Model $actor): array
    {
        if (! $actor instanceof User) {
            return ['type' => $actor instanceof Model ? $actor->getMorphClass() : 'system'];
        }

        return [
            'type' => 'user',
            'id' => (int) $actor->id,
            'uuid' => (string) $actor->uuid,
            'username' => (string) $actor->username,
            'email' => (string) $actor->email,
            'root_admin' => (bool) $actor->root_admin,
        ];
    }

    /** @return array{type: string, id: int|string, name?: string} */
    private function subject(Model $model): array
    {
        $subject = ['type' => $model->getMorphClass(), 'id' => $model->getKey()];
        foreach (['name', 'short', 'slug', 'email'] as $attribute) {
            $value = $model->getAttribute($attribute);
            if (is_string($value) && $value !== '') {
                $subject['name'] = $value;
                break;
            }
        }

        return $subject;
    }
}
