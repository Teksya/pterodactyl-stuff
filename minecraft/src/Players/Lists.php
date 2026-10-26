<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use Pterodactyl\Models\Server;

/**
 * The server's access lists (whitelist.json, ops.json, banned-players.json, banned-ips.json), edited
 * as files while the server is stopped; while it runs, the console changes them instead.
 */
final class Lists
{
    public const array FILES = [
        'whitelist' => 'whitelist.json',
        'ops' => 'ops.json',
        'banned-players' => 'banned-players.json',
        'banned-ips' => 'banned-ips.json',
    ];

    public function __construct(private readonly MinecraftServer $files) {}

    /** @return list<array<string, mixed>> */
    public function read(Server $server, string $list): array
    {
        return array_values(array_filter($this->files->json($server, self::FILES[$list]), 'is_array'));
    }

    /**
     * Who is an operator, whitelisted or banned, by lower-case UUID.
     *
     * @return array<string, array{op: int|null, whitelisted: bool, banned: string|null, name: string|null}>
     */
    public function flags(Server $server): array
    {
        $flags = [];
        $entry = function (array $row) use (&$flags): ?string {
            $uuid = strtolower((string) ($row['uuid'] ?? ''));
            if (! preg_match(Players::UUID, $uuid)) {
                return null;
            }
            $flags[$uuid] ??= ['op' => null, 'whitelisted' => false, 'banned' => null, 'name' => null];
            $flags[$uuid]['name'] ??= is_string($row['name'] ?? null) ? $row['name'] : null;

            return $uuid;
        };

        foreach ($this->read($server, 'ops') as $row) {
            if ($uuid = $entry($row)) {
                $flags[$uuid]['op'] = (int) ($row['level'] ?? 4);
            }
        }
        foreach ($this->read($server, 'whitelist') as $row) {
            if ($uuid = $entry($row)) {
                $flags[$uuid]['whitelisted'] = true;
            }
        }
        foreach ($this->read($server, 'banned-players') as $row) {
            if ($uuid = $entry($row)) {
                $flags[$uuid]['banned'] = is_string($row['reason'] ?? null) ? $row['reason'] : '';
            }
        }

        return $flags;
    }

    /**
     * Adds a player to `$list`, or takes them off it, in the file.
     *
     * @param  array{uuid: string, name: string}  $player
     */
    public function change(Server $server, string $list, array $player, bool $add, ?string $reason = null): void
    {
        $rows = $this->files->jsonListForUpdate($server, self::FILES[$list]);
        $existing = array_values(array_filter($rows, fn (mixed $row): bool => is_array($row) && strtolower((string) ($row['uuid'] ?? '')) === $player['uuid']));
        // Already on the list: an operator keeps their level, a ban its reason and date.
        if ($add && $existing !== []) {
            return;
        }

        $rows = array_values(array_filter($rows, fn (mixed $row): bool => ! is_array($row) || strtolower((string) ($row['uuid'] ?? '')) !== $player['uuid']));
        if ($add) {
            $rows[] = match ($list) {
                'ops' => ['uuid' => $player['uuid'], 'name' => $player['name'], 'level' => $this->opLevel($server), 'bypassesPlayerLimit' => false],
                'banned-players' => ['uuid' => $player['uuid'], 'name' => $player['name'], 'created' => self::date(), 'source' => 'Panel', 'expires' => 'forever', 'reason' => $reason ?: 'Banned by an operator.'],
                default => ['uuid' => $player['uuid'], 'name' => $player['name']],
            };
        }
        $this->save($server, $list, $rows);
    }

    public function setOpLevel(Server $server, string $uuid, int $level): void
    {
        $found = false;
        $rows = array_map(function (mixed $row) use ($uuid, $level, &$found): mixed {
            if (! is_array($row) || strtolower((string) ($row['uuid'] ?? '')) !== $uuid) {
                return $row;
            }
            $found = true;

            return ['level' => $level] + $row;
        }, $this->files->jsonListForUpdate($server, self::FILES['ops']));
        if (! $found) {
            throw new InvalidArgumentException('This player is not an operator.');
        }
        $this->save($server, 'ops', $rows);
    }

    public function banIp(Server $server, string $ip, bool $add, ?string $reason = null): void
    {
        $rows = array_values(array_filter($this->files->jsonListForUpdate($server, self::FILES['banned-ips']), fn (mixed $row): bool => ! is_array($row) || ($row['ip'] ?? null) !== $ip));
        if ($add) {
            $rows[] = ['ip' => $ip, 'created' => self::date(), 'source' => 'Panel', 'expires' => 'forever', 'reason' => $reason ?: 'Banned by an operator.'];
        }
        $this->save($server, 'banned-ips', $rows);
    }

    /**
     * A player's UUID for these files: the one the server already knows them by (its name cache),
     * else Mojang's, or the one an offline-mode server derives from the name when no proxy (BungeeCord,
     * Velocity) passes Mojang's on.
     *
     * @return array{uuid: string, name: string}
     */
    public function lookup(Server $server, string $name): array
    {
        Players::assertName($name);
        foreach ($this->files->json($server, 'usercache.json') as $entry) {
            if (is_array($entry) && is_string($entry['name'] ?? null) && strcasecmp($entry['name'], $name) === 0 && preg_match(Players::UUID, (string) ($entry['uuid'] ?? ''))) {
                return ['uuid' => strtolower($entry['uuid']), 'name' => $entry['name']];
            }
        }

        // Floodgate derives a Bedrock player's UUID from their Xbox id, which the panel cannot look up.
        if (str_starts_with($name, '.')) {
            throw new InvalidArgumentException('A Bedrock player who never joined is added from the console while the server runs.');
        }
        if ($this->files->properties($server)->get('online-mode', 'true') === 'false' && ! $this->behindProxy($server)) {
            return ['uuid' => self::offlineUuid($name), 'name' => $name];
        }

        try {
            $response = Http::timeout(5)->acceptJson()->get('https://api.mojang.com/users/profiles/minecraft/'.rawurlencode($name));
        } catch (ConnectionException) {
            throw new InvalidArgumentException('Mojang did not answer. Try again in a moment.');
        }
        if ($response->status() === 404 || $response->status() === 204) {
            throw new InvalidArgumentException("Mojang knows no player named {$name}.");
        }
        if (! $response->successful()) {
            throw new InvalidArgumentException($response->status() === 429 ? 'Mojang asks to slow down. Try again in a minute.' : 'Mojang could not look the player up. Try again in a moment.');
        }
        $id = (string) $response->json('id', '');
        if (! preg_match('/^[0-9a-f]{32}$/i', $id)) {
            throw new InvalidArgumentException('Mojang answered without a UUID.');
        }

        return ['uuid' => self::dashed($id), 'name' => (string) $response->json('name', $name)];
    }

    /** Whether BungeeCord (spigot.yml) or Velocity (Paper's configuration) forwards players to this server. */
    private function behindProxy(Server $server): bool
    {
        $spigot = (string) $this->files->readIfExists($server, 'spigot.yml');
        if (preg_match('/^\s*bungeecord:\s*true\b/mi', $spigot)) {
            return true;
        }
        $paper = (string) $this->files->readIfExists($server, 'config/paper-global.yml');

        return preg_match('/velocity:\s*\n(?:\s+.*\n)*?\s+enabled:\s*true\b/i', $paper) === 1;
    }

    /** The level ops.json gives a new operator: the server's op-permission-level. */
    private function opLevel(Server $server): int
    {
        $level = (int) ($this->files->properties($server)->get('op-permission-level', '4') ?? 4);

        return $level >= 1 && $level <= 4 ? $level : 4;
    }

    /** The UUID an offline-mode server gives a name: version 3, from "OfflinePlayer:<name>". */
    public static function offlineUuid(string $name): string
    {
        $hash = md5('OfflinePlayer:'.$name, true);
        $hash[6] = chr((ord($hash[6]) & 0x0F) | 0x30);
        $hash[8] = chr((ord($hash[8]) & 0x3F) | 0x80);

        return self::dashed(bin2hex($hash));
    }

    /** The date format of the ban files: "2026-10-24 21:30:00 +0000". */
    public static function date(): string
    {
        return gmdate('Y-m-d H:i:s').' +0000';
    }

    private static function dashed(string $hex): string
    {
        $hex = strtolower($hex);

        return implode('-', [substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20)]);
    }

    /** @param list<array<string, mixed>> $rows */
    private function save(Server $server, string $list, array $rows): void
    {
        // As the server writes them: two-space indents.
        $json = json_encode(array_values($rows), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $this->files->write($server, self::FILES[$list], self::indent($json));
    }

    /** PHP indents with four spaces, the server with two. */
    public static function indent(string $json): string
    {
        return (string) preg_replace_callback('/^( +)/m', fn (array $match): string => str_repeat(' ', intdiv(strlen($match[1]), 2)), $json)."\n";
    }
}
