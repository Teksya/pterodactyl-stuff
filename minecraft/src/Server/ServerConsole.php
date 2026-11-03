<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The server as Wings runs it: its power state, and its console, where the panel types the commands
 * of actions. The panel never reads the console back: what it needs to know, it asks over RCON.
 */
final class ServerConsole
{
    public function __construct(
        private readonly SendsServerCommands $commands,
        private readonly ReadsServerState $state,
    ) {}

    /** Wings' power state (running, starting, stopping, offline), or null when Wings does not answer. */
    public function state(Server $server): ?string
    {
        try {
            return $this->state->read($server)->state;
        } catch (Throwable) {
            return null;
        }
    }

    public function running(Server $server): bool
    {
        return $this->state($server) === 'running';
    }

    /** Stopped for sure: the only state in which the panel may write files the server owns. */
    public function stopped(Server $server): bool
    {
        return $this->state($server) === 'offline';
    }

    /**
     * Types `$commands` in the console, in order. The server runs them as it reads them; nothing
     * comes back.
     *
     * @param  list<string>  $commands
     */
    public function send(Server $server, array $commands): void
    {
        foreach ($commands as $command) {
            $this->commands->send($server, $command);
        }
    }
}
