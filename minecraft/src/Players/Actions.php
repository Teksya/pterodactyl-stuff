<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use InvalidArgumentException;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Models\Server;

/**
 * What each action does: a command while the player is online (over RCON when it answers, else typed
 * in the console), a change to their saved file while they are away. The lists (operators, whitelist,
 * bans) go through commands while the server runs, which owns their files, and are edited as files
 * while it is stopped.
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
        private readonly ServerRcon $rcon,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array{message: string, command: string|null}
     */
    public function player(Server $server, string $uuid, string $action, array $input): array
    {
        $player = $this->players->find($server, $uuid);
        $name = $player['name'];
        $status = $this->players->status($server);
        $running = $status['state'] === 'running';
        $version = (int) ($this->files->version($server)['dataVersion'] ?? 0);

        if ($action === 'op_level') {
            $this->assertStopped($status['state']);
            $this->lists->setOpLevel($server, $player['uuid'], Commands::integer($input['level'] ?? 4, 1, 4, 'level'));

            return ['message' => 'Operator level saved.', 'command' => null];
        }

        if (isset(self::LIST_ACTIONS[$action])) {
            [$list, $add] = self::LIST_ACTIONS[$action];
            if ($running) {
                return $this->command($server, Commands::player($this->needName($name), $action, $input, $version));
            }
            $this->assertStopped($status['state']);
            $this->lists->change($server, $list, ['uuid' => $player['uuid'], 'name' => $name ?? $player['uuid']], $add, is_string($input['reason'] ?? null) ? Commands::text($input['reason']) : null);

            return ['message' => 'Saved. The server reads it when it starts.', 'command' => null];
        }

        if ($player['online']) {
            if ($action === 'move') {
                $this->assertEmpty($server, $this->needName($name), Commands::slot($input['to'] ?? null));
            }

            return $this->command($server, Commands::player($this->needName($name), $action, $input, $version));
        }

        if (in_array($action, self::ONLINE_ONLY, true)) {
            throw new InvalidArgumentException(($name ?? 'This player').' is offline.');
        }
        // While the server starts or stops it saves its players, and past twelve players online the
        // panel may not know them all: a file changed then could be the file of someone playing.
        if (! $status['complete']) {
            throw new InvalidArgumentException('The panel cannot tell who is online right now (the server is starting or stopping, or did not answer). Try again in a moment.');
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
     * @param  list<string>  $commands
     * @return array{message: string, command: string}
     */
    public function command(Server $server, array $commands): array
    {
        if (! $this->console->running($server)) {
            throw new InvalidArgumentException('The server is not running.');
        }

        // RCON first: it runs the commands at once, says what they did, and keeps them out of the console.
        $answers = $this->rcon->attempt($server, $commands);
        if ($answers !== null) {
            $said = array_filter(array_map(fn (string $answer): string => trim((string) preg_replace('/\s*\R\s*/', ' ', $answer)), $answers), fn (string $answer): bool => $answer !== '');

            return ['message' => $said === [] ? 'Done.' : implode(' · ', $said), 'command' => implode(' · ', $commands)];
        }
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

    /** A command cannot swap two items: the target has to be empty, as the server holds it now. */
    private function assertEmpty(Server $server, string $name, string $slot): void
    {
        $live = $this->players->live($server, $name);
        if ($live === null) {
            throw new InvalidArgumentException('The panel could not read the player\'s inventory from the console, so it cannot check that slot is empty. '.($this->players->liveError ?? ''));
        }
        $items = [...$live['inventory'], ...array_values(array_filter($live['armor'])), ...array_filter([$live['offhand']]), ...$live['enderItems']];
        if (in_array($slot, array_column($items, 'slot'), true)) {
            throw new InvalidArgumentException('That slot holds an item. While the player is online, items move to empty slots only.');
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
