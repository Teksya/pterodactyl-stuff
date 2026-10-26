<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Nbt;

use InvalidArgumentException;

/**
 * Minecraft's binary NBT (player files, level.dat): big-endian, usually gzipped, with strings in
 * Java's modified UTF-8. Reading keeps every tag's type, so a file written back is what the game
 * expects.
 */
final class Nbt
{
    private string $data;
    private int $offset = 0;

    private function __construct(string $data)
    {
        $this->data = $data;
    }

    /** The root compound of a saved file, gzipped or not. */
    public static function read(string $contents): Tag
    {
        if (str_starts_with($contents, "\x1f\x8b")) {
            $decoded = @gzdecode($contents);
            if ($decoded === false) {
                throw new InvalidArgumentException('The NBT file is not valid gzip.');
            }
            $contents = $decoded;
        }

        $reader = new self($contents);
        if ($reader->byte() !== Tag::COMPOUND) {
            throw new InvalidArgumentException('The NBT file does not start with a compound.');
        }
        $reader->string();

        return $reader->payload(Tag::COMPOUND);
    }

    /** The file's values as plain PHP values. */
    public static function readPlain(string $contents): array
    {
        $plain = self::read($contents)->plain();

        return is_array($plain) ? $plain : [];
    }

    /** `$root` as a gzipped file, as the game saves player files and level.dat. */
    public static function write(Tag $root): string
    {
        return (string) gzencode(chr(Tag::COMPOUND).self::writeString('').self::writePayload($root));
    }

    private function payload(int $type): Tag
    {
        return match ($type) {
            Tag::BYTE => new Tag($type, $this->signed($this->byte(), 8)),
            Tag::SHORT => new Tag($type, $this->signed((int) $this->unpack('n', 2), 16)),
            Tag::INT => new Tag($type, $this->int()),
            Tag::LONG => new Tag($type, $this->long()),
            Tag::FLOAT => new Tag($type, (float) $this->unpack('G', 4)),
            Tag::DOUBLE => new Tag($type, (float) $this->unpack('E', 8)),
            Tag::BYTE_ARRAY => new Tag($type, array_map(fn (int $byte): int => $this->signed($byte, 8), array_values(unpack('C*', $this->take($this->length())) ?: []))),
            Tag::STRING => new Tag($type, $this->string()),
            Tag::LIST => $this->list(),
            Tag::COMPOUND => $this->compound(),
            Tag::INT_ARRAY => new Tag($type, $this->repeat($this->length(), fn (): int => $this->int())),
            Tag::LONG_ARRAY => new Tag($type, $this->repeat($this->length(), fn (): int => $this->long())),
            default => throw new InvalidArgumentException("Unknown NBT tag {$type}."),
        };
    }

    private function compound(): Tag
    {
        $values = [];
        while (($type = $this->byte()) !== Tag::END) {
            $values[$this->string()] = $this->payload($type);
        }

        return Tag::compound($values);
    }

    private function list(): Tag
    {
        $type = $this->byte();
        $items = $this->repeat(max(0, $this->int()), fn (): Tag => $this->payload($type));

        return new Tag(Tag::LIST, $items, $type);
    }

    /** @return list<mixed> */
    private function repeat(int $count, callable $read): array
    {
        $values = [];
        for ($index = 0; $index < $count; $index++) {
            $values[] = $read();
        }

        return $values;
    }

    private function length(): int
    {
        $length = $this->int();
        if ($length < 0 || $length > strlen($this->data) - $this->offset) {
            throw new InvalidArgumentException('The NBT file is truncated.');
        }

        return $length;
    }

    private function string(): string
    {
        $bytes = str_replace("\xC0\x80", "\x00", $this->take((int) $this->unpack('n', 2)));

        // Java's modified UTF-8 writes NUL as C0 80 (above) and a character beyond the BMP as its two
        // UTF-16 surrogates, three bytes each; JSON accepts neither, so both become plain UTF-8.
        return preg_replace_callback('/\xED([\xA0-\xAF])([\x80-\xBF])\xED([\xB0-\xBF])([\x80-\xBF])/', static function (array $match): string {
            $high = 0xD000 | ((ord($match[1]) & 0x3F) << 6) | (ord($match[2]) & 0x3F);
            $low = 0xD000 | ((ord($match[3]) & 0x3F) << 6) | (ord($match[4]) & 0x3F);

            return mb_chr(0x10000 + (($high - 0xD800) << 10) + ($low - 0xDC00), 'UTF-8') ?: '';
        }, $bytes) ?? $bytes;
    }

    private function byte(): int
    {
        return ord($this->take(1));
    }

    private function int(): int
    {
        return $this->signed((int) $this->unpack('N', 4), 32);
    }

    private function long(): int
    {
        return (int) unpack('J', $this->take(8))[1];
    }

    private function unpack(string $format, int $bytes): int|float
    {
        return unpack($format, $this->take($bytes))[1];
    }

    private function signed(int $value, int $bits): int
    {
        return $value >= 1 << ($bits - 1) ? $value - (1 << $bits) : $value;
    }

    private function take(int $count): string
    {
        if ($count < 0 || $this->offset + $count > strlen($this->data)) {
            throw new InvalidArgumentException('The NBT file is truncated.');
        }
        $chunk = substr($this->data, $this->offset, $count);
        $this->offset += $count;

        return $chunk;
    }

    private static function writePayload(Tag $tag): string
    {
        return match ($tag->type) {
            Tag::BYTE => pack('c', $tag->value),
            Tag::SHORT => pack('n', $tag->value & 0xFFFF),
            Tag::INT => pack('N', $tag->value & 0xFFFFFFFF),
            Tag::LONG => pack('J', $tag->value),
            Tag::FLOAT => pack('G', $tag->value),
            Tag::DOUBLE => pack('E', $tag->value),
            Tag::BYTE_ARRAY => pack('N', count($tag->value)).pack('c*', ...$tag->value),
            Tag::STRING => self::writeString((string) $tag->value),
            Tag::LIST => chr($tag->value === [] ? Tag::END : $tag->listType).pack('N', count($tag->value)).implode('', array_map(self::writePayload(...), $tag->value)),
            Tag::COMPOUND => self::writeCompound($tag),
            Tag::INT_ARRAY => pack('N', count($tag->value)).implode('', array_map(fn (int $value): string => pack('N', $value & 0xFFFFFFFF), $tag->value)),
            Tag::LONG_ARRAY => pack('N', count($tag->value)).implode('', array_map(fn (int $value): string => pack('J', $value), $tag->value)),
            default => throw new InvalidArgumentException("Unknown NBT tag {$tag->type}."),
        };
    }

    private static function writeCompound(Tag $tag): string
    {
        $bytes = '';
        foreach ($tag->value as $name => $child) {
            $bytes .= chr($child->type).self::writeString((string) $name).self::writePayload($child);
        }

        return $bytes.chr(Tag::END);
    }

    /** Back to modified UTF-8: NUL as C0 80, characters beyond the BMP as surrogates. */
    private static function writeString(string $text): string
    {
        // Bytes that are not valid UTF-8 (read as they were) are written back unchanged.
        $bytes = preg_replace_callback('/[\x{10000}-\x{10FFFF}]/u', static function (array $match): string {
            $codepoint = mb_ord($match[0], 'UTF-8') - 0x10000;
            $surrogate = static fn (int $unit): string => chr(0xE0 | ($unit >> 12)).chr(0x80 | (($unit >> 6) & 0x3F)).chr(0x80 | ($unit & 0x3F));

            return $surrogate(0xD800 + ($codepoint >> 10)).$surrogate(0xDC00 + ($codepoint & 0x3FF));
        }, $text) ?? $text;
        $bytes = str_replace("\x00", "\xC0\x80", $bytes);

        return pack('n', strlen($bytes)).$bytes;
    }
}
