<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use InvalidArgumentException;
use OlivierDutoit\Minecraft\Rcon\RconException;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use Pterodactyl\Models\Server;

/**
 * What each action does. While the server runs, an action is a command typed in its console: it
 * needs no answer, so nothing is read back. A player RCON says is offline has their saved file
 * changed instead, which the server does not hold. While the server is stopped, the files change.
 *
 * Only a change that depends on what the player holds now (an item into a slot) asks first, over
 * RCON, that the slot is empty.
 */
final class Actions
{
    private const array LIST_ACTIONS = [
        'op' => ['ops', true], 'deop' => ['ops', false],
        'whitelist_add' => ['whitelist', true], 'whitelist_remove' => ['whitelist', false],
        'ban' => ['banned-players', true], 'pardon' => ['banned-players', false],
    ];

    private const array ONLINE_ONLY = ['kick', 'kill', 'message', 'title', 'effect'];

    public function __construct(
        private readonly Players $players,
        private readonly Lists $lists,
        private readonly MinecraftServer $files,
        private readonly ServerConsole $console,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array{message: string, command: string|null}
     */
    public function player(Server $server, string $uuid, string $action, array $input): array
    {
        // A command or the file: that depends on who is online now, not a few seconds ago.
        $this->players->fresh($server);
        $player = $this->players->find($server, $uuid);
        $name = $player['name'];
        $state = $this->players->presence($server)['state'];
        $version = (int) ($this->files->version($server)['dataVersion'] ?? 0);

        if ($action === 'op_level') {
            $this->assertStopped($state);
            $this->lists->setOpLevel($server, $player['uuid'], Commands::integer($input['level'] ?? 4, 1, 4, 'level'));

            return ['message' => 'Operator level saved.', 'command' => null];
        }

        if (isset(self::LIST_ACTIONS[$action])) {
            [$list, $add] = self::LIST_ACTIONS[$action];
            if ($state === 'running') {
                return $this->command($server, Commands::player($this->needName($name), $action, $input, $version));
            }
            $this->assertStopped($state);
            $this->lists->change($server, $list, ['uuid' => $player['uuid'], 'name' => $name ?? $player['uuid']], $add, is_string($input['reason'] ?? null) ? Commands::text($input['reason']) : null);

            return ['message' => 'Saved. The server reads it when it starts.', 'command' => null];
        }

        if ($state === 'running' && $player['online'] !== false) {
            // Online, or the panel cannot tell without RCON: the command acts if the player is there.
            $name = $this->needName($name);
            if ($action === 'move') {
                $this->assertEmpty($server, $name, Commands::slot($input['to'] ?? null));
            }
            if ($action === 'give' && isset($input['slot'])) {
                $this->assertEmpty($server, $name, Commands::slot($input['slot']));
            }

            $result = $this->command($server, Commands::player($name, $action, $input, $version));
            if ($player['online'] === null) {
                // The console answers whether it found the player; the panel does not read it.
                $result['message'] = "Sent to the console. Whether {$name} is online is unknown here: the command acts only if they are.";
            }

            return $result;
        }

        // Offline: RCON says so while the server runs, or the server is stopped.
        if (in_array($action, self::ONLINE_ONLY, true)) {
            throw new InvalidArgumentException(($name ?? 'This player').' is offline.');
        }
        if ($state !== 'running') {
            $this->assertStopped($state);
        }

        return $this->offline($server, $player['uuid'], $action, $input);
    }

    /**
     * Adds a player by name to a list: Add by name.
     *
     * @return array{message: string, command: string|null}
     */
    public function add(Server $server, string $name, string $list, ?string $reason): array
    {
        Players::assertName($name);
        $action = ['whitelist' => 'whitelist_add', 'ops' => 'op', 'banned-players' => 'ban'][$list] ?? throw new InvalidArgumentException('Pick a list.');
        $state = $this->console->state($server);
        if ($state === 'running') {
            return $this->command($server, Commands::player($name, $action, ['reason' => $reason]));
        }
        $this->assertStopped($state);

        $player = $this->lists->lookup($server, $name);
        $this->lists->change($server, $list, $player, true, $reason !== null && $reason !== '' ? Commands::text($reason) : null);

        return ['message' => "{$player['name']} added. The server reads it when it starts.", 'command' => null];
    }

    /** @return array{message: string, command: string|null} */
    public function banIp(Server $server, string $ip, bool $add, ?string $reason): array
    {
        // The game bans IPv4 addresses only.
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
            throw new InvalidArgumentException('That is not an IPv4 address.');
        }
        $reason = $reason !== null && $reason !== '' ? Commands::text($reason) : null;
        $state = $this->console->state($server);
        if ($state === 'running') {
            return $this->command($server, [$add ? trim("ban-ip {$ip} {$reason}") : "pardon-ip {$ip}"]);
        }
        $this->assertStopped($state);
        $this->lists->banIp($server, $ip, $add, $reason);

        return ['message' => 'Saved. The server reads it when it starts.', 'command' => null];
    }

    /**
     * Types the commands in the console, by the vanilla commands' names on a server that keeps them as
     * `minecraft:<name>`, so that a plugin which took a name does not get them. The server runs them
     * at once; their answers show in its console, which the panel does not read.
     *
     * @param  list<string>  $commands
     * @return array{message: string, command: string}
     */
    public function command(Server $server, array $commands): array
    {
        if (! $this->console->running($server)) {
            throw new InvalidArgumentException('The server is not running.');
        }
        $namespace = $this->players->vanillaNames($server);
        $commands = array_map(fn (string $command): string => Commands::vanilla($command, $namespace), $commands);
        $this->console->send($server, $commands);

        return ['message' => 'Sent to the console.', 'command' => implode(' · ', $commands)];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{message: string, command: null}
     */
    private function offline(Server $server, string $uuid, string $action, array $input): array
    {
        $found = $this->players->readFile($server, $uuid);
        if ($found === null) {
            throw new InvalidArgumentException('This player has no saved file yet: they never played on this world.');
        }

        ['path' => $path, 'contents' => $contents] = $found;
        $file = PlayerFile::load($contents);
        $message = match ($action) {
            'gamemode' => $file->gamemode(Commands::gamemode($input['mode'] ?? null)) ?? 'Game mode changed.',
            'heal' => $file->heal((float) PlayerProfile::from($file->root->plain())['maxHealth']) ?? 'Healed.',
            'feed' => $file->feed() ?? 'Fed.',
            'teleport' => $this->teleport($file, $input),
            'clear' => $file->clearInventory(is_string($input['item'] ?? null) && $input['item'] !== '' ? Commands::id($input['item'], 'item') : null) ?? 'Inventory cleared.',
            'effect_clear' => $file->clearEffects() ?? 'Effects cleared.',
            'xp' => $this->addLevels($file, $input),
            'give' => 'Added to '.$file->give(
                Commands::id($input['item'] ?? null, 'item'),
                Commands::integer($input['count'] ?? 1, 1, 64, 'count'),
                isset($input['slot']) ? Commands::slot($input['slot']) : null,
            ).'.',
            'remove_slot' => $file->put(Commands::slot($input['slot'] ?? null), null) ?? 'Removed.',
            'move' => $file->move(Commands::slot($input['from'] ?? null), Commands::slot($input['to'] ?? null)) ?? 'Moved.',
            default => throw new InvalidArgumentException('That cannot be done while the player is offline.'),
        };

        $this->files->write($server, $path, $file->contents());

        return ['message' => "{$message} The player finds it when they join.", 'command' => null];
    }

    /** @param array<string, mixed> $input */
    private function teleport(PlayerFile $file, array $input): string
    {
        if (isset($input['to']) && $input['to'] !== '') {
            throw new InvalidArgumentException('An offline player is teleported to coordinates.');
        }
        $dimension = is_string($input['dimension'] ?? null) && $input['dimension'] !== '' ? Commands::id($input['dimension'], 'dimension') : null;
        $file->teleport(Commands::coordinate($input['x'] ?? null, 'x'), Commands::coordinate($input['y'] ?? null, 'y'), Commands::coordinate($input['z'] ?? null, 'z'), $dimension);

        return 'Moved.';
    }

    /** @param array<string, mixed> $input */
    private function addLevels(PlayerFile $file, array $input): string
    {
        if (($input['unit'] ?? 'levels') !== 'levels') {
            throw new InvalidArgumentException('An offline player gets experience in levels.');
        }
        $file->addLevels(Commands::integer($input['amount'] ?? 0, -100000, 100000, 'amount'));

        return 'Experience changed.';
    }

    /**
     * A command cannot swap two items, and one put into a slot replaces what is there: the slot has
     * to be empty, as RCON says of that slot now.
     */
    private function assertEmpty(Server $server, string $name, string $slot): void
    {
        try {
            $holds = $this->players->holds($server, $name, $slot);
        } catch (RconException $exception) {
            throw new InvalidArgumentException($exception->getCode() === RconException::ANSWERED
                ? "The panel could not tell whether that slot is empty: {$exception->getMessage()}"
                : 'Putting an item into a slot of a player who is online needs RCON, to check the slot is empty. '.$exception->getMessage());
        }
        if ($holds) {
            throw new InvalidArgumentException('That slot holds an item. While the player is online, items go to empty slots only.');
        }
    }

    /** Files the server owns are written only while it is stopped for sure. */
    private function assertStopped(?string $state): void
    {
        if ($state !== 'offline') {
            throw new InvalidArgumentException($state === null
                ? 'Wings did not say whether the server runs. Try again in a moment.'
                : "The server is {$state}. Try again once it is running or stopped.");
        }
    }

    private function needName(?string $name): string
    {
        if ($name === null) {
            throw new InvalidArgumentException('The server does not know this player\'s name yet.');
        }

        return $name;
    }
}
