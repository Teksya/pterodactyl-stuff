<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Rcon;

use RuntimeException;

/** RCON could not answer; the message is shown to the user as it is. */
final class RconException extends RuntimeException
{
    public const int DENIED = 1;
    /** RCON is not turned on in server.properties. */
    public const int OFF = 2;
    /** The server answered something else than what was asked. */
    public const int ANSWERED = 3;

    public static function off(): self
    {
        return new self('RCON is off: server.properties does not turn it on, or gives it no password.', self::OFF);
    }

    /** The host stays out: it can be an address of the administrator's own network. */
    public static function unreachable(int $port, string $reason): self
    {
        return new self("RCON is not reachable on port {$port} ({$reason}). If it was just turned on, restart the server so it starts listening.");
    }

    public static function denied(): self
    {
        return new self('The server refused the RCON password. If it was changed in server.properties, restart the server.', self::DENIED);
    }

    /** RCON failed a moment ago, for `$why`: the panel does not try again yet. */
    public static function resting(int $seconds, ?string $why = null): self
    {
        return new self($why === null
            ? "RCON did not answer a moment ago; the panel asks again within {$seconds} seconds."
            : "{$why} The panel asks again within {$seconds} seconds.");
    }

    public static function timeout(int $seconds): self
    {
        return new self("RCON did not answer within {$seconds} seconds.");
    }

    public static function protocol(string $what): self
    {
        return new self("RCON answered with {$what}.");
    }

    /** The server answered, but not with what was asked: its words say why. */
    public static function answered(string $answer): self
    {
        return new self('The server answered: '.mb_substr(trim($answer), 0, 200), self::ANSWERED);
    }
}
