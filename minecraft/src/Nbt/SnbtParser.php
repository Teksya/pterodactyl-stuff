<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Nbt;

use InvalidArgumentException;

/** SNBT, NBT's text form (what `data get` prints), into the same plain values as binary NBT. */
final class SnbtParser
{
    private int $offset = 0;
    private readonly int $length;

    public function __construct(private readonly string $text)
    {
        $this->length = strlen($text);
    }

    /** The text `data get` prints, with or without its "… has the following entity data:" lead. */
    public static function parseAnswer(string $text): mixed
    {
        if (preg_match('/^.*?has the following [a-z ]*data: /s', $text, $match)) {
            $text = substr($text, strlen($match[0]));
        }

        return (new self(trim($text)))->parse();
    }

    public function parse(): mixed
    {
        $value = $this->value();
        $this->space();
        if ($this->offset !== $this->length) {
            throw new InvalidArgumentException("Unexpected text after the SNBT value at {$this->offset}.");
        }

        return $value;
    }

    private function value(): mixed
    {
        $this->space();

        return match ($this->peek()) {
            '{' => $this->compound(),
            '[' => $this->list(),
            '"', "'" => $this->quoted(),
            default => $this->literal($this->bare()),
        };
    }

    /** @return array<string, mixed> */
    private function compound(): array
    {
        $this->expect('{');
        $values = [];
        $this->space();
        if ($this->peek() === '}') {
            $this->offset++;

            return $values;
        }

        do {
            $this->space();
            $key = in_array($this->peek(), ['"', "'"], true) ? $this->quoted() : $this->bare();
            $this->space();
            $this->expect(':');
            $values[$key] = $this->value();
            $this->space();
        } while ($this->accept(','));

        $this->expect('}');

        return $values;
    }

    /** @return list<mixed> */
    private function list(): array
    {
        $this->expect('[');
        // Typed number arrays: [B; 1b, 2b], [I; 1, 2], [L; 1L, 2L].
        if (preg_match('/\G\s*[BIL]\s*;/A', $this->text, $match, 0, $this->offset)) {
            $this->offset += strlen($match[0]);
        }

        $values = [];
        $this->space();
        if ($this->peek() === ']') {
            $this->offset++;

            return $values;
        }

        do {
            $values[] = $this->value();
            $this->space();
        } while ($this->accept(','));

        $this->expect(']');

        return $values;
    }

    private function quoted(): string
    {
        $quote = $this->text[$this->offset++];
        $value = '';
        while ($this->offset < $this->length) {
            $char = $this->text[$this->offset++];
            if ($char === $quote) {
                return $value;
            }
            if ($char !== '\\') {
                $value .= $char;
                continue;
            }

            $escaped = $this->text[$this->offset++] ?? '';
            $value .= match ($escaped) {
                'n' => "\n",
                't' => "\t",
                'r' => "\r",
                'b' => "\x08",
                'f' => "\f",
                's' => ' ',
                'u' => $this->unicode(4),
                'U' => $this->unicode(8),
                'x' => $this->unicode(2),
                default => $escaped,
            };
        }

        throw new InvalidArgumentException('An SNBT string is not closed.');
    }

    private function unicode(int $digits): string
    {
        $hex = substr($this->text, $this->offset, $digits);
        $this->offset += $digits;

        return mb_chr((int) hexdec($hex), 'UTF-8') ?: '';
    }

    private function bare(): string
    {
        if (! preg_match('/\G[A-Za-z0-9_\-.+]+/A', $this->text, $match, 0, $this->offset)) {
            throw new InvalidArgumentException("Unexpected character in SNBT at {$this->offset}.");
        }
        $this->offset += strlen($match[0]);

        return $match[0];
    }

    /** A bare word: a number with its type suffix, a boolean, or an unquoted string. */
    private function literal(string $word): mixed
    {
        if (preg_match('/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([bslfd]?)$/i', $word, $match)) {
            $suffix = strtolower($match[2]);
            $isFloat = in_array($suffix, ['f', 'd'], true) || preg_match('/[.e]/i', $match[1]);

            return $isFloat ? (float) $match[1] : (int) $match[1];
        }

        return match (strtolower($word)) {
            'true' => 1,
            'false' => 0,
            default => $word,
        };
    }

    private function space(): void
    {
        while ($this->offset < $this->length && ctype_space($this->text[$this->offset])) {
            $this->offset++;
        }
    }

    private function peek(): string
    {
        return $this->text[$this->offset] ?? '';
    }

    private function accept(string $char): bool
    {
        if ($this->peek() !== $char) {
            return false;
        }
        $this->offset++;

        return true;
    }

    private function expect(string $char): void
    {
        if (! $this->accept($char)) {
            throw new InvalidArgumentException("Expected \"{$char}\" in SNBT at {$this->offset}.");
        }
    }
}
