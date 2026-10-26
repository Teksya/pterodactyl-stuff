<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use Pterodactyl\Contracts\Servers\ReadsServerLogs;
use Pterodactyl\Contracts\Servers\ReadsServerState;
use Pterodactyl\Contracts\Servers\SendsServerCommands;
use Pterodactyl\Models\Server;
use Throwable;

/** The server's console, as the panel sends commands to it and reads its output. */
final class ServerConsole
{
    public function __construct(
        private readonly SendsServerCommands $commands,
        private readonly ReadsServerLogs $logs,
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

    /** @param list<string> $commands */
    public function send(Server $server, array $commands): void
    {
        foreach ($commands as $command) {
            $this->commands->send($server, $command);
        }
    }

    /**
     * Sends `$command` and waits for a console line the server prints in answer: one matching
     * `$pattern` after its log prefix ("[12:00:00 INFO]: "), so a player's chat line never counts.
     *
     * @return list<string>|null the lines from the match on, or null when none came in time.
     */
    public function sendAndWait(Server $server, string $command, string $pattern, float $seconds = 4.0): ?array
    {
        $before = $this->read($server);
        try {
            $this->commands->send($server, $command);
        } catch (Throwable) {
            return null;
        }

        $deadline = microtime(true) + $seconds;
        while (microtime(true) < $deadline) {
            usleep(250_000);
            $lines = self::after($before, $this->read($server));
            foreach ($lines as $index => $line) {
                if (self::answers($line, $pattern)) {
                    return array_slice($lines, $index);
                }
            }
        }

        return null;
    }

    /**
     * Sends `$commands` and waits for one answer to each: the server's lines matching `$pattern`,
     * in the order the commands were sent.
     *
     * @param  list<string>  $commands
     * @return list<string>|null the answers, or null when they did not all come in time.
     */
    public function sendEach(Server $server, array $commands, string $pattern, float $seconds = 2.5): ?array
    {
        $this->lastOutput = [];
        $before = $this->read($server);
        try {
            foreach ($commands as $command) {
                $this->commands->send($server, $command);
            }
        } catch (Throwable $exception) {
            $this->lastOutput = ['The console refused the commands: '.$exception->getMessage()];

            return null;
        }

        $deadline = microtime(true) + $seconds;
        $new = [];
        while (microtime(true) < $deadline) {
            usleep(120_000);
            $new = self::after($before, $this->read($server));
            $answers = array_values(array_filter($new, fn (string $line): bool => self::answers($line, $pattern)));
            if (count($answers) >= count($commands)) {
                return array_slice($answers, 0, count($commands));
            }
        }

        // What the console printed instead, to tell the user.
        $this->lastOutput = array_map(fn (string $line): string => mb_substr($line, 0, 160), array_slice($new, 0, 6));

        return null;
    }

    /** @var list<string> the console's lines after the commands of the last sendEach() that failed */
    public array $lastOutput = [];

    /**
     * Whether a console line is the server's own output matching `$pattern`: right after the log
     * prefix, or at the start of an unprefixed line, but not after a "<name>" chat prefix.
     */
    public static function answers(string $line, string $pattern): bool
    {
        $text = self::text($line);

        return ! str_starts_with($text, '<') && preg_match($pattern, $text) === 1;
    }

    /**
     * A console line without what comes before the server's words: a prompt redrawn before it
     * ("> ", up to a carriage return) and the log prefix ("[12:00:00 INFO]: ", "[Server thread/INFO]: ").
     */
    public static function text(string $line): string
    {
        $line = str_contains($line, "\r") ? substr($line, strrpos($line, "\r") + 1) : $line;

        return (string) preg_replace('/^[\s>]*(?:\[[^\]]*\]\s*)*:?\s*/', '', $line);
    }

    /**
     * The lines of `$now` printed after `$before` ended. Wings returns the last lines of the console,
     * so `$now` is `$before` with its first lines scrolled out and new ones after: the smallest scroll
     * that lines them up tells where the new lines start, even when the console repeats a line.
     *
     * @param  list<string>  $before
     * @param  list<string>  $now
     * @return list<string>
     */
    public static function after(array $before, array $now): array
    {
        for ($scrolled = 0; $scrolled < count($before); $scrolled++) {
            $kept = array_slice($before, $scrolled);
            if (array_slice($now, 0, count($kept)) === $kept) {
                return array_slice($now, count($kept));
            }
        }

        return $now;
    }

    /** @return list<string> */
    private function read(Server $server): array
    {
        try {
            // Without ANSI colours, so patterns match the text.
            return array_map(fn (string $line): string => rtrim((string) preg_replace('/\x1b\[[0-9;]*[A-Za-z]/', '', $line)), $this->logs->read($server));
        } catch (Throwable) {
            return [];
        }
    }
}
