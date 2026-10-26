<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Nbt\SnbtParser;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Rcon\RconException;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use OlivierDutoit\Minecraft\Server\StatusPing;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The server's players without RCON: who is online from the server list ping (or the console's `list`
 * past twelve players), everyone who joined from the world's files, and a player's state from their
 * saved file, saved first with `save-all` when they are online.
 */
final class Players
{
    /** A Java name, or a Bedrock one behind Geyser and Floodgate, which starts with a dot. */
    public const string NAME = '/^\.?[A-Za-z0-9_]{1,16}$/D';
    public const string UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di';

    /** Why the last live() read failed, to tell the user. */
    public ?string $liveError = null;

    /**
     * How the last live() read went: `rcon`, `console`, `off` (RCON is off and the console was not
     * asked), `error` (RCON did not answer) or `unsupported` (before 1.13).
     */
    public string $liveVia = 'off';

    /** @var array<string, string> what Wings answered for each path the last readFile() tried */
    private array $missing = [];

    public function __construct(
        private readonly MinecraftServer $files,
        private readonly ServerConsole $console,
        private readonly Lists $lists,
        private readonly ServerRcon $rcon,
    ) {}

    /**
     * Who is online, read at most every five seconds. `complete` is false when the panel could not
     * name everyone online: then no one is taken for offline, and no player file is changed.
     *
     * @return array{state: string|null, running: bool, online: int, max: int|null, names: list<string>, uuids: list<string>, sample: list<array{name: string, uuid: string}>, complete: bool, version: string|null}
     */
    public function status(Server $server): array
    {
        return Cache::remember('minecraft:status:'.$server->uuid, 5, function () use ($server): array {
            $state = $this->console->state($server);
            if ($state !== 'running') {
                // Starting or stopping, players may still be saved: only a stopped server is quiet.
                return ['state' => $state, 'running' => false, 'online' => 0, 'max' => null, 'names' => [], 'uuids' => [], 'sample' => [], 'complete' => $state === 'offline', 'version' => null];
            }

            try {
                [$host, $port] = $this->files->address($server);
                $ping = StatusPing::ping($host, $port);
            } catch (Throwable) {
                $ping = null;
            }

            $names = array_column($ping['sample'] ?? [], 'name');
            $uuids = array_column($ping['sample'] ?? [], 'uuid');
            $complete = $ping !== null && count($names) >= $ping['online'];
            // The ping names twelve players at most, and none when the server hides them.
            if (! $complete) {
                $lines = $this->console->sendAndWait($server, 'list', '/^There are \d+/i', 3.0);
                if ($lines !== null) {
                    $list = self::parseList(self::listAnswer($lines));
                    $names = array_column($list['players'], 'name');
                    $ping ??= ['online' => $list['online'], 'max' => $list['max'], 'version' => null];
                    $complete = count($names) >= $list['online'];
                }
            }

            return [
                'state' => $state,
                'running' => true,
                'online' => max((int) ($ping['online'] ?? 0), count($names)),
                'max' => $ping['max'] ?? null,
                'names' => array_values(array_unique($names)),
                'uuids' => array_values(array_unique($uuids)),
                'sample' => $ping['sample'] ?? [],
                'complete' => $complete,
                'version' => $ping['version'] ?? null,
            ];
        });
    }

    /**
     * The lines of the answer to `list`: the first, and the next one only when Bukkit put the names
     * there ("…players online:" then a line of names), never a chat line.
     *
     * @param  list<string>  $lines
     */
    public static function listAnswer(array $lines): string
    {
        $answer = $lines[0] ?? '';
        if (preg_match('/online:\s*$/i', $answer) && isset($lines[1]) && ServerConsole::answers($lines[1], '/^[^\s<\[]/') && ! preg_match('/There are \d+/i', $lines[1])) {
            $answer .= "\n".$lines[1];
        }

        return $answer;
    }

    /**
     * The answer of `list`: "There are 2 of a max of 20 players online: Steve, Alex", or the Bukkit
     * form "There are 2/20 players online:" with the names on the next line.
     *
     * @return array{online: int, max: int|null, players: list<array{name: string, uuid: string|null}>}
     */
    public static function parseList(string $answer): array
    {
        $online = 0;
        $max = null;
        if (preg_match('/(\d+)\s*(?:of a max of|\/)\s*(\d+)/i', $answer, $match)) {
            [$online, $max] = [(int) $match[1], (int) $match[2]];
        }

        $players = [];
        $names = trim((string) preg_replace('/^.*?online:?/is', '', $answer));
        // Console prefixes ("[12:00:00 INFO]: ") before a name line.
        $names = (string) preg_replace('/^\[[^\]]*\]:?\s*/m', '', $names);
        foreach ($names === '' ? [] : preg_split('/[,\n]\s*/', $names) as $entry) {
            // "Steve (uuid)" with `list uuids`, ranks and prefixes from plugins before the name.
            if (preg_match('/(\.?[A-Za-z0-9_]{1,16})(?:\s+\(([0-9a-f-]{36})\))?\s*$/i', trim($entry), $player)) {
                $players[] = ['name' => $player[1], 'uuid' => isset($player[2]) ? strtolower($player[2]) : null];
            }
        }

        return ['online' => max($online, count($players)), 'max' => $max, 'players' => $players];
    }

    /**
     * Every player the server knows: who joined (the name cache and the player files) and who is on
     * a list, with their state.
     *
     * @return list<array{uuid: string, name: string|null, online: bool, op: int|null, whitelisted: bool, banned: string|null, lastSeen: string|null}>
     */
    public function all(Server $server): array
    {
        $players = [];
        $add = function (string $uuid, ?string $name) use (&$players): void {
            $uuid = strtolower($uuid);
            $players[$uuid] ??= ['uuid' => $uuid, 'name' => null, 'online' => false, 'op' => null, 'whitelisted' => false, 'banned' => null, 'lastSeen' => null];
            $players[$uuid]['name'] ??= $name;
        };

        foreach ($this->files->json($server, 'usercache.json') as $entry) {
            if (is_array($entry) && preg_match(self::UUID, (string) ($entry['uuid'] ?? '')) && is_string($entry['name'] ?? null)) {
                $add($entry['uuid'], $entry['name']);
            }
        }

        // The older layout first, so a file of the newer one (a migrated world) has the last word.
        foreach (array_reverse($this->files->playerFolders($server)['data']) as $folder) {
            foreach ($this->files->list($server, $folder) as $file) {
                if (preg_match('/^([0-9a-f-]{36})\.dat$/i', (string) ($file['name'] ?? ''), $match)) {
                    $add($match[1], null);
                    $modified = isset($file['modified']) ? strtotime((string) $file['modified']) : false;
                    $players[strtolower($match[1])]['lastSeen'] = $modified ? date(DATE_ATOM, $modified) : date(DATE_ATOM);
                }
            }
        }

        foreach ($this->lists->flags($server) as $uuid => $flags) {
            $add($uuid, $flags['name']);
            $players[$uuid]['op'] = $flags['op'];
            $players[$uuid]['whitelisted'] = $flags['whitelisted'];
            $players[$uuid]['banned'] = $flags['banned'];
        }

        // By UUID where the ping gave one, so a name two accounts once had marks only the one online.
        $status = $this->status($server);
        $online = array_map('strtolower', $status['names']);
        $sampled = array_map('strtolower', array_column($status['sample'], 'name'));
        foreach ($players as $uuid => $player) {
            $name = strtolower((string) $player['name']);
            $players[$uuid]['online'] = in_array($uuid, $status['uuids'], true)
                || ($player['name'] !== null && in_array($name, $online, true) && ! in_array($name, $sampled, true));
        }

        $players = array_values($players);
        usort($players, fn (array $a, array $b): int => [$b['online'], $b['lastSeen'] ?? ''] <=> [$a['online'], $a['lastSeen'] ?? '']);

        return $players;
    }

    /**
     * One player: read live from the console while they are online (from 1.13), else from their saved
     * file, as the server last wrote it.
     *
     * @return array<string, mixed>
     */
    public function profile(Server $server, string $uuid): array
    {
        self::assertUuid($uuid);
        $player = $this->find($server, $uuid);

        // As the Pelican plugin does: an online player is read live over RCON only, which answers at
        // once; without it, from their saved file. Reading the console back is too slow for a page.
        $this->liveError = null;
        $this->liveVia = 'off';
        $profile = $player['online'] && $player['name'] !== null ? $this->live($server, $player['name'], console: false) : null;
        if ($profile !== null) {
            return [...$player, 'saved' => true, 'source' => 'live', 'liveVia' => $this->liveVia, 'readError' => null, ...$profile, 'stats' => $this->stats($server, $uuid), 'version' => $this->files->version($server)['name']];
        }

        // A file the panel cannot read leaves the page with the player's name, lists and statistics,
        // and says why.
        $readError = null;
        try {
            $file = $this->readFile($server, $uuid);
            $profile = $file === null ? null : PlayerProfile::from(Nbt::readPlain($file['contents']));
            // Listed in a player data folder (lastSeen is the file's date), yet Wings sent nothing.
            if ($file === null && $player['lastSeen'] !== null) {
                $readError = 'The player data folder lists this player\'s file, but Wings did not send it. '
                    .implode(' ', array_map(fn (string $path, string $answer): string => "{$path}: {$answer}.", array_keys($this->missing), $this->missing));
            }
        } catch (Throwable $exception) {
            $readError = 'The panel could not read the player\'s file: '.$exception->getMessage();
        }

        return [
            ...$player,
            // Never saved yet: a player who just joined, or one only on a list.
            'saved' => $profile !== null,
            'source' => 'file',
            'liveVia' => $player['online'] ? $this->liveVia : null,
            'liveError' => $this->liveError,
            'readError' => $readError,
            ...($profile ?? []),
            'stats' => $this->stats($server, $uuid),
            'version' => $this->files->version($server)['name'],
        ];
    }

    /**
     * An online player as the server holds them now: one `data get entity` per field, over RCON when it
     * is on, else (unless `$console` is false) sent to the console together and read back from its
     * output. Before 1.13 there is no `data` command: null, and the saved file is read instead.
     *
     * @return array<string, mixed>|null
     */
    public function live(Server $server, string $name, bool $console = true): ?array
    {
        self::assertName($name);
        $version = (int) ($this->files->version($server)['dataVersion'] ?? 0);
        if ($version !== 0 && $version < PlayerFile::V1_13) {
            $this->liveVia = 'unsupported';

            return null;
        }

        $paths = PlayerProfile::livePaths($version);
        $commands = array_map(fn (string $path): string => "data get entity {$name} {$path}", $paths);

        // RCON when server.properties turns it on: each command answered at once, nothing in the console.
        $answers = null;
        $rconError = null;
        try {
            $answers = $this->rcon->run($server, $commands);
        } catch (RconException $exception) {
            $rconError = $exception->getMessage();
        }
        $this->liveVia = $answers !== null ? 'rcon' : ($rconError !== null ? 'error' : 'off');
        if ($answers === null && ! $console) {
            $this->liveError = $rconError;

            return null;
        }
        if ($answers === null) {
            $this->liveVia = 'console';
        }

        // Otherwise the console, read back. Every answer counts, errors included (a field this version
        // lacks), so the panel never waits for one that will not come; they come in the order sent.
        $answers ??= $this->console->sendEach(
            $server,
            $commands,
            '/^(\S+ has the following entity data: |Found no elements matching |No entity was found|No player was found|Invalid NBT path|Unknown or incomplete command|Incorrect argument|Expected )/i',
        );
        if ($answers === null || ! str_contains(implode("\n", $answers), 'has the following entity data')) {
            $this->liveError = trim(($rconError !== null ? "{$rconError} " : '').($this->console->lastOutput === []
                ? 'The console printed nothing back in time.'
                : 'The console printed: '.implode(' | ', $this->console->lastOutput)));

            return null;
        }

        $entity = [];
        foreach ($answers as $index => $answer) {
            if (! str_contains($answer, 'has the following entity data')) {
                continue;
            }
            try {
                $entity[$paths[$index]] = SnbtParser::parseAnswer($answer);
            } catch (InvalidArgumentException) {
                // A field this version prints in a way the parser does not know stays empty.
            }
        }

        return PlayerProfile::from($entity);
    }

    /**
     * @return array{uuid: string, name: string|null, online: bool, op: int|null, whitelisted: bool, banned: string|null, lastSeen: string|null}
     */
    public function find(Server $server, string $uuid): array
    {
        foreach ($this->all($server) as $player) {
            if ($player['uuid'] === strtolower($uuid)) {
                return $player;
            }
        }

        throw new InvalidArgumentException('This server knows no such player.');
    }

    /**
     * A player's saved file, from the newest layout to the oldest, with the path it was found at
     * (where changes are written back); null when the world has none.
     *
     * @return array{path: string, contents: string}|null
     */
    public function readFile(Server $server, string $uuid): ?array
    {
        self::assertUuid($uuid);
        $this->missing = [];
        foreach ($this->files->playerFolders($server)['data'] as $folder) {
            $path = $folder.'/'.strtolower($uuid).'.dat';
            $contents = $this->files->readBinaryIfExists($server, $path);
            if ($contents !== null) {
                return ['path' => $path, 'contents' => $contents];
            }
            $this->missing[$path] = $this->files->lastMissing ?? 'not found';
        }

        return null;
    }

    /**
     * The counters the server keeps per player (world/stats), the 1.13 format and the one before.
     *
     * @return array<string, mixed>|null
     */
    public function stats(Server $server, string $uuid): ?array
    {
        self::assertUuid($uuid);
        $file = [];
        foreach ($this->files->playerFolders($server)['stats'] as $folder) {
            $file = $this->files->json($server, $folder.'/'.strtolower($uuid).'.json');
            if ($file !== []) {
                break;
            }
        }
        if ($file === []) {
            return null;
        }

        return Stats::summarise($file);
    }

    public static function assertName(string $name): void
    {
        if (! preg_match(self::NAME, $name)) {
            throw new InvalidArgumentException("\"{$name}\" is not a Minecraft player name.");
        }
    }

    public static function assertUuid(string $uuid): void
    {
        if (! preg_match(self::UUID, $uuid)) {
            throw new InvalidArgumentException("\"{$uuid}\" is not a player UUID.");
        }
    }
}
