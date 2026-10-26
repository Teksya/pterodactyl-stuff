<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Nbt;

/**
 * One NBT tag with its type, so a file read and written back keeps every byte, short and float the
 * game expects. A compound's value is an array of tags by name, a list's a list of tags of `$listType`.
 */
final class Tag
{
    public const int END = 0;
    public const int BYTE = 1;
    public const int SHORT = 2;
    public const int INT = 3;
    public const int LONG = 4;
    public const int FLOAT = 5;
    public const int DOUBLE = 6;
    public const int BYTE_ARRAY = 7;
    public const int STRING = 8;
    public const int LIST = 9;
    public const int COMPOUND = 10;
    public const int INT_ARRAY = 11;
    public const int LONG_ARRAY = 12;

    public function __construct(public int $type, public mixed $value, public int $listType = self::END) {}

    public static function byte(int $value): self
    {
        return new self(self::BYTE, $value);
    }

    public static function short(int $value): self
    {
        return new self(self::SHORT, $value);
    }

    public static function int(int $value): self
    {
        return new self(self::INT, $value);
    }

    public static function float(float $value): self
    {
        return new self(self::FLOAT, $value);
    }

    public static function double(float $value): self
    {
        return new self(self::DOUBLE, $value);
    }

    public static function string(string $value): self
    {
        return new self(self::STRING, $value);
    }

    /** @param array<string, Tag> $values */
    public static function compound(array $values = []): self
    {
        return new self(self::COMPOUND, $values);
    }

    /** @param list<Tag> $items */
    public static function list(int $type, array $items = []): self
    {
        return new self(self::LIST, $items, $items === [] ? $type : $items[0]->type);
    }

    public function get(string $key): ?self
    {
        return $this->type === self::COMPOUND ? ($this->value[$key] ?? null) : null;
    }

    public function set(string $key, self $tag): self
    {
        $this->value[$key] = $tag;

        return $this;
    }

    public function remove(string $key): self
    {
        unset($this->value[$key]);

        return $this;
    }

    /** The same kind of number tag as this one, holding `$value`: a Health that was a short stays one. */
    public function withNumber(int|float $value): self
    {
        return match ($this->type) {
            self::FLOAT, self::DOUBLE => new self($this->type, (float) $value),
            default => new self($this->type, (int) round($value)),
        };
    }

    /** The tag as plain PHP values: compounds as arrays by name, lists and number arrays as lists. */
    public function plain(): mixed
    {
        return match ($this->type) {
            self::COMPOUND => array_map(fn (Tag $tag): mixed => $tag->plain(), $this->value),
            self::LIST => array_map(fn (Tag $tag): mixed => $tag->plain(), $this->value),
            default => $this->value,
        };
    }
}
