<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Rcon;

use RuntimeException;

/** RCON could not answer; the message is shown to the user as it is. */
final class RconException extends RuntimeException
{
    public const int DENIED = 1;
    /** The commands were sent, so they may have run: they must not be sent again another way. */
    public const int SENT = 2;

    /** The host stays out: it can be an address of the administrator's own network. */
    public static function unreachable(int $port, string $reason): self
    {
        return new self("RCON is not reachable on port {$port} ({$reason}).");
    }

    public static function denied(): self
    {
        return new self('The server refused the RCON password. If it was changed in server.properties, restart the server.', self::DENIED);
    }

    public static function resting(): self
    {
        return new self('RCON did not answer a moment ago; the panel tries it again within a minute.');
    }

    public static function timeout(int $seconds): self
    {
        return new self("RCON did not answer within {$seconds} seconds.");
    }

    public static function protocol(string $what): self
    {
        return new self("RCON answered with {$what}.");
    }

    public static function sent(self $previous): self
    {
        return new self("RCON took the command but then failed, so it may have run: check the server before trying again. {$previous->getMessage()}", self::SENT, $previous);
    }
}
