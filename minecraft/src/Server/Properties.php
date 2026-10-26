<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Server;

/**
 * server.properties, a Java properties file. Reading unescapes values; changing one key rewrites
 * only its line, so comments, order and the keys of plugins and mods stay as they were.
 */
final class Properties
{
    /** @param list<string> $lines */
    private function __construct(private array $lines) {}

    public static function parse(string $contents): self
    {
        return new self(preg_split('/\r\n|\r|\n/', rtrim($contents, "\r\n")) ?: []);
    }

    public function get(string $key, ?string $default = null): ?string
    {
        foreach ($this->lines as $line) {
            $entry = self::entry($line);
            if ($entry !== null && $entry[0] === $key) {
                return $entry[1];
            }
        }

        return $default;
    }

    public function set(string $key, string $value): self
    {
        $line = self::escape($key, true).'='.self::escape($value, false);
        foreach ($this->lines as $index => $existing) {
            if ((self::entry($existing)[0] ?? null) === $key) {
                $this->lines[$index] = $line;

                return $this;
            }
        }
        $this->lines[] = $line;

        return $this;
    }

    public function contents(): string
    {
        return implode("\n", $this->lines)."\n";
    }

    /** @return array{string, string}|null */
    private static function entry(string $line): ?array
    {
        $line = ltrim($line);
        if ($line === '' || $line[0] === '#' || $line[0] === '!') {
            return null;
        }
        if (! preg_match('/^((?:\\\\.|[^\\\\=:\s])*)\s*[=:\s]\s*(.*)$/s', $line, $match)) {
            return [self::unescape($line), ''];
        }

        return [self::unescape($match[1]), self::unescape($match[2])];
    }

    private static function unescape(string $text): string
    {
        // A character beyond the BMP is written as a UTF-16 surrogate pair.
        $text = (string) preg_replace_callback('/\\\\u(d[89ab][0-9a-f]{2})\\\\u(d[c-f][0-9a-f]{2})/i', static function (array $match): string {
            $codepoint = 0x10000 + ((hexdec($match[1]) - 0xD800) << 10) + (hexdec($match[2]) - 0xDC00);

            return mb_chr((int) $codepoint, 'UTF-8') ?: '';
        }, $text);

        return (string) preg_replace_callback('/\\\\(u[0-9a-fA-F]{4}|.)/', static function (array $match): string {
            $escaped = $match[1];
            if ($escaped[0] === 'u' && strlen($escaped) === 5) {
                return mb_chr((int) hexdec(substr($escaped, 1)), 'UTF-8') ?: '';
            }

            return match ($escaped) {
                'n' => "\n",
                't' => "\t",
                'r' => "\r",
                'f' => "\f",
                default => $escaped,
            };
        }, $text);
    }

    /** As Java writes it: separators and backslashes escaped, and characters outside ASCII as \uXXXX. */
    private static function escape(string $text, bool $key): string
    {
        $escaped = '';
        foreach (mb_str_split($text, 1, 'UTF-8') as $index => $char) {
            $escaped .= match (true) {
                $char === '\\' => '\\\\',
                $char === "\n" => '\\n',
                $char === "\t" => '\\t',
                $char === "\r" => '\\r',
                $char === '=' || $char === ':' || $char === '#' || $char === '!' => '\\'.$char,
                $char === ' ' && ($key || $index === 0) => '\\ ',
                mb_ord($char, 'UTF-8') > 0x7E || mb_ord($char, 'UTF-8') < 0x20 => self::unicode(mb_ord($char, 'UTF-8')),
                default => $char,
            };
        }

        return $escaped;
    }

    private static function unicode(int $codepoint): string
    {
        if ($codepoint <= 0xFFFF) {
            return sprintf('\\u%04X', $codepoint);
        }
        // Java strings are UTF-16: a character beyond the BMP is a surrogate pair.
        $codepoint -= 0x10000;

        return sprintf('\\u%04X\\u%04X', 0xD800 + ($codepoint >> 10), 0xDC00 + ($codepoint & 0x3FF));
    }
}
