<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Rcon\RconClient;
use OlivierDutoit\Minecraft\Rcon\RconException;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;

/**
 * A server's RCON, when server.properties turns it on: one connection that answers each command at
 * once, faster than reading the console back, and silent in it.
 *
 * The panel tries the RCON port's allocation address, the node's FQDN, then 127.0.0.1 and localhost
 * (a panel on the node's machine), remembers the one that answered, and gives RCON up for a minute
 * when none does, so the console takes over without waiting each time.
 */
final class ServerRcon
{
    private const int TIMEOUT = 2;

    public function __construct(private readonly MinecraftServer $files) {}

    /**
     * Whether RCON is on, on which port, whether that port is one of the server's allocations, and
     * the allocation ports free for it.
     *
     * @return array{enabled: bool, port: int|null, allocated: bool, ports: list<int>}
     */
    public function status(Server $server): array
    {
        $properties = $this->files->properties($server);
        $port = $this->port($properties);

        return [
            'enabled' => $this->enabled($properties),
            'port' => $port,
            'allocated' => $port !== null && $this->allocation($server, $port) !== null,
            'ports' => $this->freePorts($server, $properties),
        ];
    }

    /** Turns RCON on with a new random password on `$port`, one of the server's allocations. */
    public function enable(Server $server, int $port): void
    {
        $properties = $this->files->properties($server);
        if (! in_array($port, $this->freePorts($server, $properties), true)) {
            throw new InvalidArgumentException("Port {$port} is not one of this server's allocations, or the game or its query uses it.");
        }

        $properties
            ->set('enable-rcon', 'true')
            ->set('rcon.port', (string) $port)
            ->set('rcon.password', bin2hex(random_bytes(16)))
            ->set('broadcast-rcon-to-ops', 'false');
        $this->files->write($server, MinecraftServer::PROPERTIES, $properties->contents());
        Cache::forget($this->key($server, 'host'));
        Cache::forget($this->key($server, 'down'));
    }

    /**
     * Runs `$commands` on one connection and returns each answer, in order; null when RCON is off.
     *
     * @param  list<string>  $commands
     * @return list<string>|null
     *
     * @throws RconException when RCON is on but no address answers, now or within the last minute.
     */
    public function run(Server $server, array $commands): ?array
    {
        $properties = $this->files->properties($server);
        $port = $this->port($properties);
        if (! $this->enabled($properties) || $port === null) {
            return null;
        }
        if (Cache::has($this->key($server, 'down'))) {
            throw RconException::resting();
        }
        $password = (string) $properties->get('rcon.password');

        $last = null;
        foreach ($this->hosts($server, $port) as $host) {
            try {
                $client = RconClient::connect($host, $port, $password, self::TIMEOUT);
            } catch (RconException $exception) {
                $last = $exception;
                // A wrong password is the same at every address.
                if ($exception->getCode() === RconException::DENIED) {
                    break;
                }
                continue;
            }

            Cache::put($this->key($server, 'host'), $host, 600);
            try {
                return array_map(fn (string $command): string => $client->command($command), $commands);
            } finally {
                $client->close();
            }
        }

        Cache::put($this->key($server, 'down'), true, 60);
        throw $last ?? RconException::unreachable($port, 'no address to try');
    }

    private function enabled(Properties $properties): bool
    {
        return trim((string) $properties->get('enable-rcon')) === 'true' && trim((string) $properties->get('rcon.password')) !== '';
    }

    /** @return list<string> the address that answered last first, then the others. */
    private function hosts(Server $server, int $port): array
    {
        $allocation = $this->allocation($server, $port) ?? $server->allocation;
        $ip = (string) $allocation?->ip;
        $hosts = [
            Cache::get($this->key($server, 'host')),
            in_array($ip, ['', '0.0.0.0', '::', '[::]'], true) ? null : $ip,
            $server->node->fqdn,
            '127.0.0.1',
            'localhost',
        ];

        return array_values(array_unique(array_filter($hosts, fn (mixed $host): bool => is_string($host) && $host !== '')));
    }

    private function allocation(Server $server, int $port): ?Allocation
    {
        return $server->allocations()->where('port', $port)->first();
    }

    /** @return list<int> the server's allocation ports that the game and query do not use. */
    private function freePorts(Server $server, Properties $properties): array
    {
        $used = [(int) $properties->get('server-port', '25565'), (int) $properties->get('query.port', '25565'), $server->allocation?->port];

        return $server->allocations()->orderBy('port')->pluck('port')
            ->map(fn ($port): int => (int) $port)
            ->reject(fn (int $port): bool => in_array($port, $used, true))
            ->values()
            ->all();
    }

    private function port(Properties $properties): ?int
    {
        $port = (int) $properties->get('rcon.port', '25575');

        return $port > 0 && $port < 65536 ? $port : null;
    }

    private function key(Server $server, string $what): string
    {
        return "minecraft:rcon-{$what}:".$server->uuid;
    }
}
