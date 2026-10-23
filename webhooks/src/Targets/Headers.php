<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

use InvalidArgumentException;

/** Extra request headers, written one "Name: value" per line. */
final class Headers
{
    private const int MAX = 20;

    /** Headers the HTTP client sets itself, or that would change where the request goes. */
    private const array RESERVED = ['host', 'content-length', 'transfer-encoding', 'connection', 'expect', 'te', 'upgrade'];

    /**
     * @return array<string, string>
     *
     * @throws InvalidArgumentException naming the first line that is not a valid header
     */
    public static function parse(?string $text): array
    {
        $headers = [];
        foreach (preg_split('/\r\n|\r|\n/', (string) $text) ?: [] as $number => $line) {
            if (trim($line) === '') {
                continue;
            }

            if (! preg_match('/^([!#$%&\'*+.^_`|~0-9A-Za-z-]{1,100}):[ \t]*([^\x00-\x08\x0A-\x1F\x7F]{0,2000})$/', $line, $match)) {
                throw new InvalidArgumentException(sprintf('Header line %d is not "Name: value".', $number + 1));
            }

            if (in_array(mb_strtolower($match[1]), self::RESERVED, true)) {
                throw new InvalidArgumentException(sprintf('The %s header cannot be set.', $match[1]));
            }

            $headers[$match[1]] = rtrim($match[2]);
        }

        if (count($headers) > self::MAX) {
            throw new InvalidArgumentException(sprintf('At most %d headers can be set.', self::MAX));
        }

        return $headers;
    }
}
