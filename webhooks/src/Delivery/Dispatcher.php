<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Delivery;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Events\EventCatalog;
use OlivierDutoit\Webhooks\Events\WebhookEvent;
use OlivierDutoit\Webhooks\Jobs\DeliverWebhook;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Settings;
use Throwable;

/** Finds the endpoints an event goes to and queues one delivery for each. */
final class Dispatcher
{
    private const string ACTIVE_KEY = 'webhooks:has-endpoints';

    /** Whether any endpoint is turned on, so the panel does no work at all when none is. */
    public static function hasEndpoints(): bool
    {
        try {
            return (bool) Cache::remember(self::ACTIVE_KEY, 300, fn (): bool => Endpoint::query()->where('enabled', true)->exists());
        } catch (Throwable) {
            return false;
        }
    }

    /** Call after an endpoint is created, changed or removed. */
    public static function forget(): void
    {
        Cache::forget(self::ACTIVE_KEY);
    }

    /** @return int how many deliveries were queued */
    public function dispatch(WebhookEvent $event): int
    {
        if (! self::hasEndpoints()) {
            return 0;
        }

        $definition = $event->definition();
        $candidates = [];
        if ($definition->availableTo(Scope::Admin)) {
            $candidates[] = fn (Builder $query) => $query->where('scope', Scope::Admin->value);
        }
        if ($definition->availableTo(Scope::Server) && $event->serverId() !== null && Settings::scopeEnabled(Scope::Server)) {
            $candidates[] = fn (Builder $query) => $query->where('scope', Scope::Server->value)->where('server_id', $event->serverId());
        }
        if ($definition->availableTo(Scope::Account) && $event->userIds !== [] && Settings::scopeEnabled(Scope::Account)) {
            $candidates[] = fn (Builder $query) => $query->where('scope', Scope::Account->value)->whereIn('user_id', $event->userIds);
        }

        if ($candidates === []) {
            return 0;
        }

        $endpoints = Endpoint::query()
            ->where('enabled', true)
            ->where(function (Builder $query) use ($candidates): void {
                foreach ($candidates as $candidate) {
                    $query->orWhere($candidate);
                }
            })
            ->get();

        $queued = 0;
        foreach ($endpoints as $endpoint) {
            if (! $this->wants($endpoint, $event)) {
                continue;
            }

            $delivery = $this->createDelivery($endpoint, $event);
            DeliverWebhook::dispatch($delivery->id);
            $queued++;
        }

        return $queued;
    }

    public function createDelivery(Endpoint $endpoint, WebhookEvent $event): Delivery
    {
        $uuid = (string) Str::uuid();

        return Delivery::query()->create([
            'uuid' => $uuid,
            'endpoint_id' => $endpoint->id,
            'event' => $event->key,
            'payload' => $event->payload($endpoint->scope, $uuid),
            'status' => Delivery::PENDING,
            'is_test' => $event->test,
        ])->setRelation('endpoint', $endpoint);
    }

    /** Whether the endpoint subscribes to the event, and its filters let it through. */
    public function wants(Endpoint $endpoint, WebhookEvent $event): bool
    {
        if (! $event->definition()->availableTo($endpoint->scope) || ! EventCatalog::selects($endpoint->events ?? [], $event->key)) {
            return false;
        }

        if ($endpoint->scope !== Scope::Admin) {
            // A service the administrator no longer offers users stops receiving.
            return in_array($endpoint->provider, Settings::providers(), true);
        }

        $servers = array_map(intval(...), $endpoint->filters['servers'] ?? []);
        $nodes = array_map(intval(...), $endpoint->filters['nodes'] ?? []);
        if ($servers === [] && $nodes === []) {
            return true;
        }

        // A node event (unreachable, reachable) goes through a node filter that lists its node.
        if ($event->serverId() === null) {
            return $event->nodeId() === null || $nodes === [] || in_array($event->nodeId(), $nodes, true);
        }

        return in_array($event->serverId(), $servers, true) || in_array($event->nodeId(), $nodes, true);
    }
}
