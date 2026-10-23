<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Lang;

/**
 * The sentence the panel's activity feed shows for an entry ("Started a new backup daily"),
 * from the panel's activity translations and the entry's properties.
 */
final class DescriptionRenderer
{
    /** @param array<string, mixed> $properties */
    public function render(string $event, array $properties, string $fallback): string
    {
        $key = 'activity.'.str_replace(':', '.', $event);
        $count = $this->count($properties);

        $chosen = match (true) {
            Lang::has($key.'_one') && $count === 1 => $key.'_one',
            Lang::has($key.'_other') && $count !== null => $key.'_other',
            Lang::has($key) && is_string(Lang::get($key)) => $key,
            default => null,
        };

        if ($chosen === null) {
            return $fallback;
        }

        $replace = ['count' => (string) ($count ?? 0)];
        foreach (Arr::dot($properties) as $name => $value) {
            $replace[(string) $name] = is_scalar($value) || $value === null ? (string) $value : (json_encode($value) ?: '');
        }

        $text = Lang::get($chosen, $replace);

        return is_string($text) ? $text : $fallback;
    }

    /** @param array<string, mixed> $properties */
    private function count(array $properties): ?int
    {
        if (isset($properties['count']) && is_numeric($properties['count'])) {
            return (int) $properties['count'];
        }

        foreach (['files', 'tags', 'eggs', 'nodes'] as $list) {
            if (isset($properties[$list]) && is_array($properties[$list])) {
                return count($properties[$list]);
            }
        }

        return null;
    }
}
