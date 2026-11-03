<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use Closure;
use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Rcon\RconClient;
use OlivierDutoit\Minecraft\Rcon\RconConnection;
use OlivierDutoit\Minecraft\Rcon\RconException;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;

/**
 * A running server's RCON: how the panel asks it questions. Everything the panel reads from a running
 * server goes through here (who is online, a player's state, the time and the game rules, the save
 * before a snapshot); actions are commands typed in its console instead, which need no answer.
 *
 * The panel tries the RCON port's allocation address and alias, the node's FQDN, then 127.0.0.1 (a
 * panel on the node's machine), and remembers the one that answered. When none does, it waits a
 * minute before trying again, so pages that refresh do not wait on each address every time. A
 * request asks all its questions on one connection, closed when it ends: each connection is a line
 * in the server's console.
 */
final class ServerRcon
{
    private const int TIMEOUT = 2;
    private const int REST = 60;

    /** @var array<string, RconConnection> the connection to each server, open for the rest of the request */
    private array $connections = [];

    /**
     * How the panel opens a connection; the tests put a stand-in here.
     *
     * @var (Closure(string, int, string, int): RconConnection)|null
     */
    public static ?Closure $connector = null;

    public function __construct(private readonly MinecraftServer $files) {}

    /**
     * Whether RCON is on, on which port, whether that port is one of the server's allocations,
     * whether server.properties already has a password, and the allocation ports free for it.
     *
     * @return array{enabled: bool, port: int|null, allocated: bool, password: bool, ports: list<int>}
     */
    public function status(Server $server): array
    {
        $properties = $this->files->properties($server);
        $port = $this->port($properties);

        return [
            'enabled' => $this->enabled($properties),
            'port' => $port,
            'allocated' => $port !== null && $this->allocation($server, $port) !== null,
            'password' => $this->hasPassword($properties),
            'ports' => $this->freePorts($server, $properties),
        ];
    }

    /**
     * Turns RCON on on `$port`, one of the server's allocations, keeping the password already in
     * server.properties unless `$newPassword` asks for a random one (always written when there is none).
     */
    public function enable(Server $server, int $port, bool $newPassword): void
    {
        $properties = $this->files->properties($server);
        if (! in_array($port, $this->freePorts($server, $properties), true)) {
            throw new InvalidArgumentException("Port {$port} is not one of this server's allocations, or the game or its query uses it.");
        }

        if ($newPassword || ! $this->hasPassword($properties)) {
            $properties->set('rcon.password', bin2hex(random_bytes(16)));
        }
        $properties
            ->set('enable-rcon', 'true')
            ->set('rcon.port', (string) $port)
            ->set('broadcast-rcon-to-ops', 'false');
        $this->files->write($server, MinecraftServer::PROPERTIES, $properties->contents());
        Cache::forget($this->key($server, 'host'));
        Cache::forget($this->key($server, 'down'));
        if (isset($this->connections[$server->uuid])) {
            $this->connections[$server->uuid]->close();
            unset($this->connections[$server->uuid]);
        }
    }

    /**
     * Asks the running server: runs `$commands` and returns each answer, in order, waiting up to
     * `$wait` seconds for each, on the request's connection to it.
     *
     * @param  list<string>  $commands
     * @return list<string>
     *
     * @throws RconException when RCON is off, cannot be reached, refuses the password or does not answer.
     */
    public function ask(Server $server, array $commands, int $wait = self::TIMEOUT): array
    {
        $connection = $this->connections[$server->uuid] ??= $this->open($server);
        try {
            $connection->wait($wait);

            return array_map(fn (string $command): string => $connection->command($command), $commands);
        } catch (RconException $exception) {
            // The rest of an answer may still be on its way: the next question opens another connection.
            $connection->close();
            unset($this->connections[$server->uuid]);
            throw $exception;
        }
    }

    public function __destruct()
    {
        foreach ($this->connections as $connection) {
            $connection->close();
        }
    }

    /** @throws RconException */
    private function open(Server $server): RconConnection
    {
        $properties = $this->files->properties($server);
        $port = $this->port($properties);
        if (! $this->enabled($properties) || $port === null) {
            throw RconException::off();
        }
        $down = Cache::get($this->key($server, 'down'));
        if ($down !== null) {
            throw RconException::resting(self::REST, is_string($down) ? $down : null);
        }
        $password = (string) $properties->get('rcon.password');

        $started = microtime(true);
        $failures = [];
        foreach ($this->hosts($server, $port) as $host) {
            try {
                $connection = $this->connect($host, $port, $password);
            } catch (RconException $exception) {
                // A wrong password is the same at every address, and at every request until the server
                // restarts with the one in server.properties: each try is a line in its console.
                if ($exception->getCode() === RconException::DENIED) {
                    Cache::put($this->key($server, 'down'), $exception->getMessage(), self::REST);
                    throw $exception;
                }
                $failures[] = $exception;
                continue;
            }

            Cache::put($this->key($server, 'host'), $host, 600);

            return $connection;
        }

        $failure = $failures[0] ?? RconException::unreachable($port, 'no address to try');
        // Addresses that kept the panel waiting are not tried again for a while. A refusal costs
        // nothing (nothing listens yet, as after RCON was just turned on): the next request asks again.
        if (microtime(true) - $started >= 1) {
            Cache::put($this->key($server, 'down'), $failure->getMessage(), self::REST);
        }
        throw $failure;
    }

    private function connect(string $host, int $port, string $password): RconConnection
    {
        return self::$connector !== null
            ? (self::$connector)($host, $port, $password, self::TIMEOUT)
            : RconClient::connect($host, $port, $password, self::TIMEOUT);
    }

    private function enabled(Properties $properties): bool
    {
        return trim((string) $properties->get('enable-rcon')) === 'true' && $this->hasPassword($properties);
    }

    private function hasPassword(Properties $properties): bool
    {
        return trim((string) $properties->get('rcon.password')) !== '';
    }

    /** @return list<string> the address that answered last first, then the others. */
    private function hosts(Server $server, int $port): array
    {
        $allocation = $this->allocation($server, $port) ?? $server->allocation;
        $ip = (string) ($allocation->ip ?? '');
        $hosts = [
            Cache::get($this->key($server, 'host')),
            in_array($ip, ['', '0.0.0.0', '::', '[::]'], true) ? null : $ip,
            $allocation->ip_alias ?? null,
            $server->node->fqdn,
            '127.0.0.1',
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
