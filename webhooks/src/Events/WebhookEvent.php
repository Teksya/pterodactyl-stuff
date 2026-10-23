<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

use Carbon\CarbonImmutable;
use OlivierDutoit\Webhooks\Scope;

/**
 * Something that happened, ready to be matched against endpoints and turned into payloads.
 * It holds everything any scope may see; payload() leaves out what a scope may not.
 */
final readonly class WebhookEvent
{
    /**
     * @param  array{type: string, id?: int, uuid?: string, username?: string, email?: string, root_admin?: bool}  $actor
     * @param  array{id: int, uuid: string, identifier: string, name: string, url: string, owner_id: int, node: array{id: int, name: string}}|null  $server
     * @param  list<int>  $userIds  the accounts the event concerns, for account endpoints
     * @param  list<array{type: string, id: int|string, name?: string}>  $subjects  other models the event is about
     * @param  array<string, mixed>  $properties
     */
    public function __construct(
        public string $key,
        public CarbonImmutable $occurredAt,
        public string $description,
        public array $actor = ['type' => 'system'],
        public ?string $ip = null,
        public ?array $server = null,
        public array $userIds = [],
        public array $subjects = [],
        public array $properties = [],
        public bool $test = false,
    ) {}

    public function definition(): EventDefinition
    {
        return EventCatalog::definition($this->key);
    }

    public function serverId(): ?int
    {
        return $this->server['id'] ?? null;
    }

    /** The server's node, or the node a node event is about. */
    public function nodeId(): ?int
    {
        $node = $this->server['node']['id'] ?? $this->properties['node_id'] ?? null;

        return is_numeric($node) ? (int) $node : null;
    }

    /**
     * What an endpoint of the scope receives. Server endpoints are managed by subusers, so
     * they never see who else signed in from where, or an actor's email address.
     *
     * @return array<string, mixed>
     */
    public function payload(Scope $scope, string $deliveryUuid): array
    {
        $definition = $this->definition();
        $actor = $this->actor;
        $server = $this->server;

        if ($scope !== Scope::Admin) {
            $actor = array_intersect_key($actor, array_flip(['type', 'uuid', 'username']));
            if ($server !== null) {
                unset($server['owner_id']);
            }
        }

        return [
            'id' => $deliveryUuid,
            'event' => $this->key,
            'label' => $definition->label,
            'group' => $definition->group,
            'severity' => $definition->severity->value,
            'description' => $this->description,
            'occurred_at' => $this->occurredAt->toIso8601String(),
            'scope' => $scope->value,
            'test' => $this->test,
            'actor' => $actor,
            'ip' => $scope === Scope::Server ? null : $this->ip,
            'server' => $server,
            'subjects' => $scope === Scope::Admin ? $this->subjects : [],
            'properties' => $this->properties,
            'panel' => ['name' => (string) config('app.name', 'Pterodactyl'), 'url' => rtrim((string) config('app.url'), '/')],
        ];
    }
}
