<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Rcon\RconException;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The server's players: everyone who joined (the name cache and the world's player files) and who is
 * on a list, who is online, and a player's state.
 *
 * While the server runs, what it holds is asked over RCON and nothing else: `list` says who is online,
 * `data get entity` reads an online player. Without RCON the panel does not guess: whether a player
 * is online stays unknown. Every player it does not read live shows their saved file: the truth
 * while the server is stopped or RCON says they are offline, their last save otherwise (nobody can
 * say whether they play, or the version, before 1.13, cannot be asked about a player).
 */
final class Players
{
    /** A Java name, or a Bedrock one behind Geyser and Floodgate, which starts with a dot. */
    public const string NAME = '/^\.?[A-Za-z0-9_]{1,16}$/D';
    public const string UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di';

    /** How long who is online is kept for every request of a server. */
    private const int PRESENCE_SECONDS = 5;

    /** @var array<string, array<string, mixed>> who is online, by server, as this request has it */
    private array $presence = [];

    /** @var array<string, string> what Wings answered for each path the last readFile() tried */
    private array $missing = [];

    public function __construct(
        private readonly MinecraftServer $files,
        private readonly ServerConsole $console,
        private readonly Lists $lists,
        private readonly ServerRcon $rcon,
    ) {}

    /**
     * Who is online. `known` is true when the server is stopped (nobody) or RCON answered `list`;
     * otherwise `online` is null and `rcon` says why RCON could not be asked. `complete` is false
     * when `list` named players the panel could not read: the others are not known to be offline.
     *
     * Every page of every viewer asks it: the answer is kept a few seconds for all of them, so RCON
     * is asked once rather than for each request. An action asks afresh (fresh()).
     *
     * @return array{state: string|null, known: bool, complete: bool, online: int|null, max: int|null, players: array<string, string>, vanilla: string, rcon: array{state: string, error: string|null}}
     *               players: name by lower-case UUID, or by lower-case name when the version lists no UUIDs;
     *               vanilla: `minecraft:` when the server answered `minecraft:list`, the name of its vanilla commands.
     */
    public function presence(Server $server): array
    {
        return $this->presence[$server->uuid] ??= Cache::remember(self::presenceKey($server), self::PRESENCE_SECONDS, fn (): array => $this->askPresence($server));
    }

    /** Asks who is online now rather than a few seconds ago: before an action, or once RCON was turned on. */
    public function fresh(Server $server): void
    {
        unset($this->presence[$server->uuid]);
        Cache::forget(self::presenceKey($server));
    }

    private static function presenceKey(Server $server): string
    {
        return 'minecraft:presence:'.$server->uuid;
    }

    /** @return array<string, mixed> */
    private function askPresence(Server $server): array
    {
        $state = $this->console->state($server);
        $unknown = ['state' => $state, 'known' => false, 'complete' => false, 'online' => null, 'max' => null, 'players' => [], 'vanilla' => '', 'rcon' => ['state' => 'idle', 'error' => null]];
        if ($state !== 'running') {
            // Starting or stopping, players may still be connected: only a stopped server is empty.
            return $state === 'offline' ? [...$unknown, 'known' => true, 'complete' => true, 'online' => 0] : $unknown;
        }

        try {
            $list = $this->askList($server);
        } catch (RconException $exception) {
            return [...$unknown, 'rcon' => self::rconError($exception)];
        }

        $players = [];
        foreach ($list['players'] as $player) {
            $players[$player['uuid'] ?? strtolower($player['name'])] = $player['name'];
        }

        return [...$unknown, 'known' => true, 'complete' => $list['complete'], 'online' => $list['online'], 'max' => $list['max'], 'players' => $players, 'vanilla' => $list['vanilla'], 'rcon' => ['state' => 'ok', 'error' => null]];
    }

    /**
     * Who is online, as the vanilla `list uuids` says it. On Bukkit-family servers (Paper, Spigot,
     * Purpur…) a plugin can take the name `list` and answer in its own words; the vanilla command keeps
     * the name `minecraft:list` there, which the other servers (vanilla, Fabric, Forge) do not know.
     * That name is asked first, and `list uuids` only when it did not give the vanilla answer, so a
     * plugin's `list` neither runs for nothing nor, when slow, costs the answer. The name that
     * answered (`vanilla`) is the one every other question and command uses.
     *
     * @return array{online: int, max: int|null, players: list<array{name: string, uuid: string|null}>, complete: bool, vanilla: string}
     *
     * @throws RconException
     */
    private function askList(Server $server): array
    {
        try {
            return [...self::parseList($this->rcon->ask($server, ['minecraft:list uuids'])[0] ?? ''), 'vanilla' => 'minecraft:'];
        } catch (RconException $exception) {
            if ($exception->getCode() !== RconException::ANSWERED) {
                throw $exception;
            }
            // A server without `minecraft:` names, whose `list` is the vanilla one.
            return [...self::parseList($this->rcon->ask($server, ['list uuids'])[0] ?? ''), 'vanilla' => ''];
        }
    }

    /**
     * `minecraft:` on a server that answered `minecraft:list`, the name of its vanilla commands, for
     * questions and for the commands of actions alike; nothing when it did not, or RCON could not say.
     */
    public function vanillaNames(Server $server): string
    {
        return $this->presence($server)['vanilla'] ?? '';
    }

    /** `$command` by the name of the vanilla command on this server. */
    private function vanilla(Server $server, string $command): string
    {
        return Commands::vanilla($command, $this->vanillaNames($server));
    }

    /**
     * RCON's state as the pages show it: off (not turned on) or error (on, but it could not be asked,
     * or did not answer as the game does).
     *
     * @return array{state: string, error: string|null}
     */
    public static function rconError(RconException $exception): array
    {
        return $exception->getCode() === RconException::OFF
            ? ['state' => 'off', 'error' => null]
            : ['state' => 'error', 'error' => $exception->getMessage()];
    }

    /**
     * RCON as the pages need it: how it is set up, and whether the running server answers.
     *
     * @return array<string, mixed>
     */
    public function rcon(Server $server): array
    {
        return [...$this->rcon->status($server), ...$this->presence($server)['rcon']];
    }

    /**
     * The answer of `list uuids`: "There are 2 of a max of 20 players online: Steve (uuid), Alex (uuid)",
     * the names alone before the UUIDs were listed, or the Bukkit form "There are 2/20 players online:"
     * with the names after the colon. A name is whatever has no space (in offline mode, "Bob!" or
     * "Ann." join too); with UUIDs, each player is found by theirs. `complete` is false when fewer
     * players were read than the count says, or the server cut its answer short ("..."): the others
     * are not known to be offline.
     *
     * @return array{online: int, max: int|null, players: list<array{name: string, uuid: string|null}>, complete: bool}
     */
    public static function parseList(string $answer): array
    {
        if (! preg_match('/There are\s+(\d+)\s*(?:of a max of|\/)\s*(\d+)/i', $answer, $match)) {
            throw RconException::answered($answer);
        }

        $cut = str_ends_with($answer, '...');
        $players = [];
        $names = trim((string) preg_replace('/^.*?online:?/is', '', $answer));
        // With UUIDs, even one cut short: only whole "name (uuid)" entries count.
        if (preg_match('/\([0-9a-f]{8}-/i', $names)) {
            preg_match_all('/(\S+)\s+\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i', $names, $found, PREG_SET_ORDER);
            foreach ($found as [, $name, $uuid]) {
                $players[] = ['name' => $name, 'uuid' => strtolower($uuid)];
            }
        } else {
            $entries = $names === '' ? [] : preg_split('/\s*[,\n]\s*/', $names);
            if ($cut) {
                // The last name may be cut short.
                array_pop($entries);
            }
            foreach ($entries as $entry) {
                // Ranks and prefixes from plugins come before the name.
                if (preg_match('/(\S+)$/', trim($entry), $player)) {
                    $players[] = ['name' => $player[1], 'uuid' => null];
                }
            }
        }

        $online = max((int) $match[1], count($players));

        return ['online' => $online, 'max' => (int) $match[2], 'players' => $players, 'complete' => ! $cut && count($players) >= $online];
    }

    /**
     * Every player the server knows: who joined (the name cache and the player files) and who is on
     * a list, with their state. `online` is null while the server runs without RCON.
     *
     * @return list<array{uuid: string, name: string|null, online: bool|null, op: int|null, whitelisted: bool, banned: string|null, lastSeen: string|null}>
     */
    public function all(Server $server): array
    {
        $presence = $this->presence($server);
        $players = [];
        $add = function (string $uuid, ?string $name) use (&$players): void {
            $uuid = strtolower($uuid);
            $players[$uuid] ??= ['uuid' => $uuid, 'name' => null, 'online' => null, 'op' => null, 'whitelisted' => false, 'banned' => null, 'lastSeen' => null];
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

        // Someone online the files do not know yet: they just joined for the first time.
        foreach ($presence['players'] as $key => $name) {
            // A name of digits alone ("2008") is an integer key.
            if (preg_match(self::UUID, (string) $key)) {
                $add($key, $name);
            }
        }

        if ($presence['known']) {
            // By UUID where `list` gave them, so a name two accounts once had marks only the one
            // online; by name for versions that list names alone. When `list` named players the panel
            // could not read, the others stay unknown rather than offline: their file is not theirs
            // to change while they may play.
            foreach ($players as $uuid => $player) {
                $online = isset($presence['players'][$uuid])
                    || ($player['name'] !== null && isset($presence['players'][strtolower($player['name'])]));
                $players[$uuid]['online'] = $online ?: ($presence['complete'] ? false : null);
            }
        }

        $players = array_values($players);
        usort($players, fn (array $a, array $b): int => [$b['online'] === true, $b['lastSeen'] ?? ''] <=> [$a['online'] === true, $a['lastSeen'] ?? '']);

        return $players;
    }

    /**
     * One player: over RCON while they play (from 1.13), from their saved file otherwise; `source` says
     * which. The file is the truth while the server is stopped or RCON says they are offline. When
     * nobody can say whether they play (RCON off or not answering, the server starting or stopping),
     * `online` is null and the file is their last save, which the page shows as such and leaves as it
     * is. `source` is `none` only for a player RCON lists online but did not read.
     *
     * @return array<string, mixed>
     */
    public function profile(Server $server, string $uuid): array
    {
        self::assertUuid($uuid);
        $player = $this->find($server, $uuid);
        $presence = $this->presence($server);
        $version = $this->files->version($server);
        $base = [
            ...$player,
            'state' => $presence['state'],
            'rcon' => $presence['rcon'],
            'liveError' => null,
            'unread' => [],
            'readError' => null,
            'stats' => $this->stats($server, $uuid),
            'version' => $version['name'],
        ];

        $canAsk = $version['dataVersion'] === null || $version['dataVersion'] >= PlayerFile::V1_13;
        if ($player['online'] === true && $player['name'] !== null && $canAsk) {
            try {
                return [...$base, 'source' => 'live', 'saved' => true, ...$this->live($server, $player['name'])];
            } catch (RconException $exception) {
                return [...$base, 'source' => 'none', 'saved' => false, 'liveError' => $exception->getMessage()];
            } catch (InvalidArgumentException) {
                // A name offline mode lets in ("Bob!") that a command cannot name.
                return [...$base, 'source' => 'none', 'saved' => false, 'liveError' => "Commands cannot name \"{$player['name']}\": only letters, digits and _ can be asked about."];
            }
        }

        // A file the panel cannot read leaves the page with the player's name, lists and statistics,
        // and says why.
        $profile = null;
        try {
            $file = $this->readFile($server, $uuid);
            $profile = $file === null ? null : PlayerProfile::from(Nbt::readPlain($file['contents']));
            // Listed in a player data folder (lastSeen is the file's date), yet Wings sent nothing.
            if ($file === null && $player['lastSeen'] !== null) {
                $base['readError'] = 'The player data folder lists this player\'s file, but Wings did not send it. '
                    .implode(' ', array_map(fn (string $path, string $answer): string => "{$path}: {$answer}.", array_keys($this->missing), $this->missing));
            }
        } catch (Throwable $exception) {
            $base['readError'] = 'The panel could not read the player\'s file: '.$exception->getMessage();
        }

        // Never saved yet: a player who just joined, or one only on a list.
        return [...$base, 'source' => 'file', 'saved' => $profile !== null, ...($profile ?? [])];
    }

    /**
     * An online player as the server holds them now, asked over RCON: one `data get entity` per field,
     * on one connection, by the name of the vanilla command `list` found; a field the server cuts
     * short is asked again in parts (see LivePlayer). Minecraft 1.13 and later.
     *
     * @return array<string, mixed>
     *
     * @throws RconException when RCON cannot be asked, or the server answered no field (the player left).
     */
    public function live(Server $server, string $name): array
    {
        self::assertName($name);
        $version = (int) ($this->files->version($server)['dataVersion'] ?? 0);
        if ($version !== 0 && $version < PlayerFile::V1_13) {
            throw new InvalidArgumentException('Before Minecraft 1.13 the server cannot be asked about a player.');
        }

        // A field the player does not have (no effects, nothing worn, a field of another version)
        // answers "Found no elements…" and stays empty; what cannot be read is said in `unread`, so
        // that an empty slot never passes for the truth.
        $read = (new LivePlayer($this->rcon))->read($server, $this->vanilla($server, "data get entity {$name}"), PlayerProfile::livePaths($version), $version);

        return [...PlayerProfile::from($read['entity']), 'unread' => $read['unread']];
    }

    /**
     * Whether an online player holds an item in `$slot` (inventory.0-35, armor.head…, offhand,
     * ender.0-26): `data get` for that slot alone. Empty only when the server answers "Found no
     * elements matching" that very path; full for data however long, cut short or not.
     *
     * @throws RconException when RCON cannot be asked, or answers anything else.
     */
    public function holds(Server $server, string $name, string $slot): bool
    {
        self::assertName($name);
        $path = PlayerProfile::slotPath($slot, (int) ($this->files->version($server)['dataVersion'] ?? 0));
        $answer = $this->rcon->ask($server, [$this->vanilla($server, "data get entity {$name} {$path}")])[0] ?? '';

        return match (LivePlayer::answer($answer, $path)[0]) {
            LivePlayer::NONE => false,
            LivePlayer::VALUE, LivePlayer::UNREADABLE => true,
            default => throw RconException::answered($answer),
        };
    }

    /**
     * @return array{uuid: string, name: string|null, online: bool|null, op: int|null, whitelisted: bool, banned: string|null, lastSeen: string|null}
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
