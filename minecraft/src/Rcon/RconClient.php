<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Rcon;

/**
 * Minecraft's RCON: the Source RCON protocol, as the vanilla server speaks it. One connection runs
 * any number of commands, each answered in full before the next is sent; an answer longer than one
 * packet (an inventory) comes in several, all read.
 */
final class RconClient
{
    private const int AUTH = 3;
    private const int COMMAND = 2;
    private const int RESPONSE = 0;
    // The vanilla server cuts long answers into bodies of this many bytes.
    private const int FRAGMENT = 4096;

    /** @var resource */
    private $socket;
    private int $id = 0;

    private function __construct(mixed $socket, private int $timeout)
    {
        $this->socket = $socket;
    }

    /** @throws RconException when the server cannot be reached or refuses the password. */
    public static function connect(string $host, int $port, string $password, int $timeout = 2): self
    {
        $host = trim($host, '[]');
        $address = sprintf('tcp://%s:%d', str_contains($host, ':') ? "[{$host}]" : $host, $port);
        $socket = @stream_socket_client($address, $code, $message, $timeout);
        if ($socket === false) {
            throw RconException::unreachable($port, $message ?: "error {$code}");
        }

        stream_set_timeout($socket, $timeout);
        $client = new self($socket, $timeout);
        $client->authenticate($password);

        return $client;
    }

    /** The server's answer to a command, without colour codes. */
    public function command(string $command): string
    {
        $id = $this->send(self::COMMAND, $command);
        [$replyId, , $body] = $this->read();
        if ($replyId !== $id) {
            throw RconException::protocol('an answer to another request');
        }

        // A long answer comes in several packets. The server reads one request at a time and sends a
        // whole answer before reading the next, so a marker sent now is answered after the last piece.
        if (strlen($body) >= self::FRAGMENT) {
            $marker = $this->send(self::RESPONSE, '');
            while (true) {
                [$replyId, , $piece] = $this->read();
                if ($replyId === $marker) {
                    break;
                }
                $body .= $piece;
            }
        }

        return self::plain($body);
    }

    /** How long each answer may take from now on: saving a world takes longer than a question. */
    public function wait(int $seconds): void
    {
        $this->timeout = $seconds;
        stream_set_timeout($this->socket, $seconds);
    }

    public function close(): void
    {
        if (is_resource($this->socket)) {
            fclose($this->socket);
        }
    }

    public function __destruct()
    {
        $this->close();
    }

    /** Text without the § formatting codes servers put in their answers. */
    public static function plain(string $text): string
    {
        // Text that is not valid UTF-8 (from some plugins) stays as it came rather than coming back empty.
        return trim(preg_replace('/\x{00A7}[0-9A-FK-ORX]/iu', '', $text) ?? $text);
    }

    private function authenticate(string $password): void
    {
        $id = $this->send(self::AUTH, $password);
        // Some servers send an empty response before the authentication result.
        do {
            [$replyId, $type] = $this->read();
        } while ($type === self::RESPONSE && $replyId === $id);

        if ($replyId === -1 || $replyId !== $id) {
            $this->close();
            throw RconException::denied();
        }
    }

    private function send(int $type, string $body): int
    {
        $id = ++$this->id;
        $payload = pack('VV', $id, $type).$body."\x00\x00";
        $packet = pack('V', strlen($payload)).$payload;

        for ($written = 0; $written < strlen($packet); $written += $sent) {
            $sent = @fwrite($this->socket, substr($packet, $written));
            if ($sent === false || $sent === 0) {
                throw RconException::protocol('a closed connection');
            }
        }

        return $id;
    }

    /** @return array{int, int, string} the request id, the packet type and the body. */
    private function read(): array
    {
        $length = unpack('Vlength', $this->bytes(4))['length'];
        if ($length < 10 || $length > 1 << 20) {
            throw RconException::protocol("a packet of {$length} bytes");
        }

        $packet = $this->bytes($length);
        ['id' => $id, 'type' => $type] = unpack('Vid/Vtype', substr($packet, 0, 8));
        // Little-endian and signed: a refused password answers with the id -1.
        $id = $id >= 0x80000000 ? $id - 0x100000000 : $id;

        return [$id, $type, substr($packet, 8, -2)];
    }

    private function bytes(int $count): string
    {
        $data = '';
        while (strlen($data) < $count) {
            $chunk = fread($this->socket, $count - strlen($data));
            if ($chunk === false || $chunk === '') {
                $meta = stream_get_meta_data($this->socket);
                throw $meta['timed_out'] ? RconException::timeout($this->timeout) : RconException::protocol('a closed connection');
            }
            $data .= $chunk;
        }

        return $data;
    }
}
