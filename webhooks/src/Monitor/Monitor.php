<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Monitor;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use OlivierDutoit\Webhooks\Events\EventCatalog;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Models\ServerMonitor;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Settings;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Data\ServerState;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Task;
use Throwable;

/**
 * What Wings does not tell the panel: a server that stopped on its own, one running out of
 * CPU, memory or disk, a node that stopped answering. It polls the servers some endpoint
 * watches (through the panel's shared 20-second state cache) and reports changes only.
 */
final readonly class Monitor
{
    /** A power action this recent explains a server going offline. */
    private const array EXPECTED_STOPS = [
        'server:power.stop', 'server:power.kill', 'server:power.restart', 'server:reinstall',
        'admin:server.reinstall', 'admin:server.suspend', 'admin:server.rebuild', 'admin:server.transfer', 'server:backup.restore',
    ];

    /** An alert clears once usage falls this many points below its threshold. */
    private const int HYSTERESIS = 10;

    public function __construct(private ReadsServerState $states, private EventBuilder $builder, private Dispatcher $dispatcher) {}

    /** @return array{servers: int, events: int, nodes: int} */
    public function run(bool $force = false): array
    {
        $stats = ['servers' => 0, 'events' => 0, 'nodes' => 0];
        if (! Settings::bool('monitor') || ! Dispatcher::hasEndpoints()) {
            return $stats;
        }

        $interval = Settings::int('monitor_interval', 1, 60);
        if (! $force && ! Cache::add('webhooks:monitor:tick', true, now()->addSeconds($interval * 60 - 5))) {
            return $stats;
        }

        $unreachable = [];
        foreach ($this->watchedServers() as $server) {
            if (isset($unreachable[$server->node_id])) {
                continue;
            }

            try {
                $state = $this->states->read($server);
            } catch (DaemonConnectionException $exception) {
                // Wings errors about one server (not installed, transferring) come wrapped the same
                // way: only a failed connection says the node is down for its other servers too.
                if ($exception->getPrevious() instanceof ConnectionException) {
                    $unreachable[$server->node_id] = true;
                }

                continue;
            } catch (Throwable $exception) {
                report($exception);

                continue;
            }

            $stats['servers']++;
            $stats['events'] += $this->compare($server, $state, $interval);
        }

        // Daemon is the panel's own Wings client, outside the extension API: without it, no node checks.
        if (Settings::bool('node_monitor') && class_exists(Daemon::class) && $this->watches(['node:unreachable', 'node:reachable'], adminOnly: true)) {
            foreach (Node::query()->get() as $node) {
                $stats['nodes']++;
                $stats['events'] += $this->checkNode($node);
            }
        }

        return $stats;
    }

    /** @return int events sent */
    private function compare(Server $server, ServerState $reading, int $interval): int
    {
        $monitor = ServerMonitor::query()->firstOrNew(['server_id' => $server->id]);
        // A reading older than a few rounds says nothing about what happened since.
        $stale = $monitor->checked_at === null || $monitor->checked_at->lt(now()->subMinutes($interval * 3 + 1));
        $previous = $stale ? null : $monitor->state;
        $current = in_array($reading->state, ['running', 'starting', 'stopping'], true) ? $reading->state : 'offline';
        $events = 0;
        $name = (string) $server->name;

        if ($previous !== null && $previous !== $current) {
            if ($current === 'running') {
                $events += $this->send($server, 'server:state.running', sprintf('%s is running.', $name));
            } elseif ($current === 'offline') {
                $unexpected = in_array($previous, ['running', 'starting'], true) && ! $reading->isSuspended && ! $this->stoppedOnPurpose($server, $interval);
                $events += $unexpected
                    ? $this->send($server, 'server:state.crashed', sprintf('%s stopped without a stop, restart or kill request: it may have crashed.', $name), ['previous_state' => $previous])
                    : $this->send($server, 'server:state.offline', sprintf('%s is offline.', $name), ['previous_state' => $previous]);
            }
        }

        $limits = [
            'cpu' => [(float) $reading->cpuAbsolute, (float) $server->cpu, '%'],
            'memory' => [$reading->memoryBytes / 1048576, (float) $server->memory, 'MiB'],
            'disk' => [$reading->diskBytes / 1048576, (float) $server->disk, 'MiB'],
        ];
        foreach ($limits as $resource => [$used, $limit, $unit]) {
            // No limit, nothing to compare with; CPU and memory only mean something while it runs.
            if ($limit <= 0 || ($resource !== 'disk' && $current !== 'running')) {
                $monitor->{$resource.'_alert'} = false;

                continue;
            }

            $percent = round($used / $limit * 100, 1);
            $threshold = Settings::int($resource.'_threshold', 1, 100);
            if (! $monitor->{$resource.'_alert'} && $percent >= $threshold) {
                $monitor->{$resource.'_alert'} = true;
                $events += $this->send($server, 'server:resources.'.$resource, sprintf(
                    '%s is using %s%% of its %s limit (%s of %s %s).',
                    $name,
                    $percent,
                    $resource === 'cpu' ? 'CPU' : $resource,
                    round($used),
                    round($limit),
                    $unit,
                ), ['resource' => $resource, 'percent' => $percent, 'used' => round($used, 1), 'limit' => $limit, 'unit' => $unit, 'threshold' => $threshold]);
            } elseif ($monitor->{$resource.'_alert'} && $percent < $threshold - self::HYSTERESIS) {
                $monitor->{$resource.'_alert'} = false;
            }
        }

        $monitor->state = $current;
        $monitor->checked_at = now();
        $monitor->save();

        return $events;
    }

    private function checkNode(Node $node): int
    {
        $key = 'webhooks:monitor:node:'.$node->id;
        $error = null;

        try {
            Daemon::node($node)->systemInformation();
        } catch (Throwable $exception) {
            $error = $exception->getMessage();
        }

        $previous = Cache::get($key);
        $current = $error === null ? 'up' : 'down';
        Cache::forever($key, $current);

        if ($previous === null || $previous === $current) {
            return 0;
        }

        $event = $current === 'down'
            ? $this->builder->forNode($node, 'node:unreachable', sprintf('Wings on %s (%s) does not answer: %s', $node->name, $node->fqdn, $error), ['error' => $error])
            : $this->builder->forNode($node, 'node:reachable', sprintf('Wings on %s (%s) answers again.', $node->name, $node->fqdn));

        return $this->dispatcher->dispatch($event) > 0 ? 1 : 0;
    }

    /** @param array<string, mixed> $properties */
    private function send(Server $server, string $key, string $description, array $properties = []): int
    {
        $this->dispatcher->dispatch($this->builder->forServer($server, $key, $description, $properties));

        return 1;
    }

    /** A power action someone asked for, or a schedule's power task (schedules log no activity). */
    private function stoppedOnPurpose(Server $server, int $interval): bool
    {
        $since = now()->subMinutes($interval + 2);

        return ActivityLog::query()
            ->whereIn('event', self::EXPECTED_STOPS)
            ->where('timestamp', '>=', $since)
            ->whereHas('subjects', fn ($query) => $query->where('subject_type', 'server')->where('subject_id', $server->id))
            ->exists()
            || Schedule::query()
                ->where('server_id', $server->id)
                ->where(fn ($query) => $query->where('is_processing', true)->orWhere('last_run_at', '>=', $since))
                ->whereHas('tasks', fn ($query) => $query->where('action', Task::ACTION_POWER)->whereIn('payload', ['stop', 'restart', 'kill']))
                ->exists();
    }

    /**
     * The servers some enabled endpoint wants state or resource events for.
     *
     * @return Collection<int, Server>
     */
    private function watchedServers(): Collection
    {
        $keys = EventCatalog::monitoredKeys();
        $all = false;
        $servers = [];
        $nodes = [];

        foreach ($this->endpointsWatching($keys) as $endpoint) {
            if ($endpoint->scope === Scope::Server) {
                $servers[] = (int) $endpoint->server_id;

                continue;
            }

            $filterServers = $endpoint->filters['servers'] ?? [];
            $filterNodes = $endpoint->filters['nodes'] ?? [];
            if ($filterServers === [] && $filterNodes === []) {
                $all = true;
                break;
            }

            array_push($servers, ...array_map(intval(...), $filterServers));
            array_push($nodes, ...array_map(intval(...), $filterNodes));
        }

        if (! $all && $servers === [] && $nodes === []) {
            return new Collection();
        }

        return Server::query()
            ->with('node')
            ->when(! $all, fn ($query) => $query->where(fn ($inner) => $inner->whereIn('id', $servers)->orWhereIn('node_id', $nodes)))
            ->get();
    }

    /** @param list<string> $keys */
    private function watches(array $keys, bool $adminOnly = false): bool
    {
        return $this->endpointsWatching($keys, $adminOnly)->isNotEmpty();
    }

    /**
     * @param  list<string>  $keys
     * @return Collection<int, Endpoint>
     */
    private function endpointsWatching(array $keys, bool $adminOnly = false): Collection
    {
        $scopes = $adminOnly || ! Settings::scopeEnabled(Scope::Server) ? [Scope::Admin->value] : [Scope::Admin->value, Scope::Server->value];

        return Endpoint::query()
            ->where('enabled', true)
            ->whereIn('scope', $scopes)
            ->get()
            ->filter(function (Endpoint $endpoint) use ($keys): bool {
                foreach ($keys as $key) {
                    if (EventCatalog::selects($endpoint->events ?? [], $key)) {
                        return true;
                    }
                }

                return false;
            })
            ->values();
    }
}
