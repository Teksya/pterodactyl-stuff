<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains;

use Pterodactyl\Facades\Extensions;
use Throwable;

/** The administrator's settings (Admin → Extensions → Subdomains), with their defaults. */
final class Settings
{
    public const array DEFAULTS = [
        'server_subdomains' => true,
        'domains' => [],
        'max_per_server' => 1,
        'min_length' => 3,
        'reserved' => ['www', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'webmail', 'panel', 'admin', 'api', 'status', 'ns1', 'ns2', 'autodiscover'],
        'api_token' => '',
        'ttl' => '1',
        'srv_overrides' => '',
    ];

    public static function get(string $key): mixed
    {
        $default = self::DEFAULTS[$key] ?? null;

        try {
            return Extensions::settings(SubdomainsProvider::ID)->get($key, $default) ?? $default;
        } catch (Throwable) {
            return $default;
        }
    }

    public static function bool(string $key): bool
    {
        return (bool) self::get($key);
    }

    public static function int(string $key, int $min = 0, int $max = PHP_INT_MAX): int
    {
        $value = self::get($key);

        return max($min, min($max, is_numeric($value) ? (int) $value : (int) self::DEFAULTS[$key]));
    }

    /** @return list<string> */
    public static function strings(string $key): array
    {
        $value = self::get($key);
        $items = is_array($value) ? $value : self::DEFAULTS[$key];

        return array_values(array_unique(array_filter(array_map(
            fn (mixed $item): string => is_string($item) ? rtrim(strtolower(trim($item)), '.') : '',
            $items,
        ))));
    }

    /** @return list<string> the domains servers can take a name under, such as example.com. */
    public static function domains(): array
    {
        return self::strings('domains');
    }

    public static function token(): string
    {
        $token = self::get('api_token');

        return is_string($token) ? trim($token) : '';
    }

    public static function configured(): bool
    {
        return self::token() !== '' && self::domains() !== [];
    }
}
