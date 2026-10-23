<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks;

use Pterodactyl\Facades\Extensions;
use Throwable;

/** The administrator's settings (Admin → Extensions → Webhooks), with their defaults. */
final class Settings
{
    public const array DEFAULTS = [
        'server_webhooks' => true,
        'account_webhooks' => true,
        'max_per_server' => 10,
        'max_per_account' => 10,
        'providers' => ['discord', 'slack', 'teams', 'telegram', 'ntfy', 'gotify', 'pushover', 'matrix', 'http', 'custom'],
        'private_targets' => false,
        'timeout' => 10,
        'max_attempts' => 5,
        'rate_limit' => 30,
        'auto_disable' => 20,
        'retention_days' => 14,
        'monitor' => true,
        'monitor_interval' => '1',
        'cpu_threshold' => 95,
        'memory_threshold' => 95,
        'disk_threshold' => 90,
        'node_monitor' => true,
    ];

    public static function get(string $key): mixed
    {
        $default = self::DEFAULTS[$key] ?? null;

        try {
            return Extensions::settings(WebhooksProvider::ID)->get($key, $default) ?? $default;
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

    public static function scopeEnabled(Scope $scope): bool
    {
        return match ($scope) {
            Scope::Admin => true,
            Scope::Server => self::bool('server_webhooks'),
            Scope::Account => self::bool('account_webhooks'),
        };
    }
}
