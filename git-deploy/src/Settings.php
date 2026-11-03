<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy;

use Pterodactyl\Facades\Extensions;
use Throwable;

/** The administrator's settings (Admin → Extensions → Git Deploy), with their defaults. */
final class Settings
{
    public const array DEFAULTS = [
        'providers' => ['github', 'gitlab', 'gitea', 'generic'],
        'private_hosts' => false,
        'max_archive_mb' => 200,
        'keep_releases' => 5,
    ];

    public static function get(string $key): mixed
    {
        $default = self::DEFAULTS[$key] ?? null;

        try {
            return Extensions::settings(GitDeployProvider::ID)->get($key, $default) ?? $default;
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
    public static function providers(): array
    {
        $value = self::get('providers');

        return is_array($value) ? array_values(array_filter($value, is_string(...))) : self::DEFAULTS['providers'];
    }
}
