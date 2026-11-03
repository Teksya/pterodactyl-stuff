<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Rcon;

/** An open RCON connection: the server answers each command before the next is sent. */
interface RconConnection
{
    /**
     * The server's answer to `$command`, without colour codes.
     *
     * @throws RconException when the server does not answer.
     */
    public function command(string $command): string;

    /** How long each answer may take from now on: saving a world takes longer than a question. */
    public function wait(int $seconds): void;

    public function close(): void;
}
