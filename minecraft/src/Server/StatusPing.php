<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

use RuntimeException;

/**
 * Minecraft's server list ping (1.7 and later): what the multiplayer screen shows, with no setup on
 * the server. It gives the players online, the maximum, and up to twelve of their names.
 */
final class StatusPing
{
    /** A status answer is a few kilobytes; a server's icon makes it a few dozen. */
    private const int MAX_PACKET = 256 * 1024;

    /** When the whole ping gives up: a server sending a byte at a time cannot hold the panel. */
    private static float $deadline = 0.0;

    /**
     * @return array{online: int, max: int, sample: list<array{name: string, uuid: string}>, version: string|null}
     *
     * @throws RuntimeException when the server does not answer.
     */
    public static function ping(string $host, int $port, int $timeout = 3): array
    {
        $host = trim($host, '[]');
        $address = sprintf('tcp://%s:%d', str_contains($host, ':') ? "[{$host}]" : $host, $port);
        $socket = @stream_socket_client($address, $code, $message, $timeout);
        if ($socket === false) {
            throw new RuntimeException("The server does not answer on port {$port} ({$message}).");
        }
        stream_set_timeout($socket, $timeout);
        self::$deadline = microtime(true) + $timeout;

        try {
            // Handshake: protocol -1 (any), the address and port, then state 1 (status).
            $handshake = "\x00".self::varint(-1).self::string($host).pack('n', $port).self::varint(1);
            self::write($socket, self::varint(strlen($handshake)).$handshake);
            self::write($socket, "\x01\x00");

            $length = self::readVarint($socket);
            $packet = self::read($socket, $length);
            // The packet id, then the JSON's length and the JSON.
            $offset = 0;
            self::varintAt($packet, $offset);
            $jsonLength = self::varintAt($packet, $offset);
            $json = substr($packet, $offset, $jsonLength);
        } finally {
            fclose($socket);
        }

        return self::parse($json);
    }

    /**
     * @return array{online: int, max: int, sample: list<array{name: string, uuid: string}>, version: string|null}
     */
    public static function parse(string $json): array
    {
        $status = json_decode($json, true);
        if (! is_array($status)) {
            throw new RuntimeException('The server answered the ping with something other than JSON.');
        }

        $players = is_array($status['players'] ?? null) ? $status['players'] : [];
        $sample = [];
        foreach (is_array($players['sample'] ?? null) ? $players['sample'] : [] as $entry) {
            // Servers that hide their players (hide-online-players, plugins) send placeholders.
            if (is_array($entry) && is_string($entry['name'] ?? null) && is_string($entry['id'] ?? null) && $entry['id'] !== '00000000-0000-0000-0000-000000000000') {
                $sample[] = ['name' => $entry['name'], 'uuid' => strtolower($entry['id'])];
            }
        }

        return [
            'online' => (int) ($players['online'] ?? 0),
            'max' => (int) ($players['max'] ?? 0),
            'sample' => $sample,
            'version' => is_string($status['version']['name'] ?? null) ? $status['version']['name'] : null,
        ];
    }

    private static function varint(int $value): string
    {
        $value &= 0xFFFFFFFF;
        $bytes = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            $bytes .= chr($value !== 0 ? $byte | 0x80 : $byte);
        } while ($value !== 0);

        return $bytes;
    }

    private static function string(string $text): string
    {
        return self::varint(strlen($text)).$text;
    }

    /** The VarInt at `$offset` in `$bytes`; `$offset` moves past it. */
    private static function varintAt(string $bytes, int &$offset): int
    {
        $value = 0;
        for ($shift = 0; $shift < 35; $shift += 7) {
            if (! isset($bytes[$offset])) {
                throw new RuntimeException('The server answered the ping with a truncated packet.');
            }
            $byte = ord($bytes[$offset++]);
            $value |= ($byte & 0x7F) << $shift;
            if (($byte & 0x80) === 0) {
                return $value;
            }
        }

        throw new RuntimeException('The server answered the ping with a malformed number.');
    }

    /** @param resource $socket */
    private static function readVarint($socket): int
    {
        $value = 0;
        for ($shift = 0; $shift < 35; $shift += 7) {
            $byte = ord(self::read($socket, 1));
            $value |= ($byte & 0x7F) << $shift;
            if (($byte & 0x80) === 0) {
                return $value;
            }
        }

        throw new RuntimeException('The server answered the ping with a malformed length.');
    }

    /** @param resource $socket */
    private static function read($socket, int $count): string
    {
        if ($count < 0 || $count > self::MAX_PACKET) {
            throw new RuntimeException('The server answered the ping with a packet of an unexpected size.');
        }
        $data = '';
        while (strlen($data) < $count) {
            if (microtime(true) > self::$deadline) {
                throw new RuntimeException('The server took too long to answer the ping.');
            }
            $chunk = fread($socket, min(8192, $count - strlen($data)));
            if ($chunk === false || $chunk === '') {
                throw new RuntimeException('The server stopped answering the ping.');
            }
            $data .= $chunk;
        }

        return $data;
    }

    /** @param resource $socket */
    private static function write($socket, string $bytes): void
    {
        if (@fwrite($socket, $bytes) !== strlen($bytes)) {
            throw new RuntimeException('The ping could not be sent.');
        }
    }
}
