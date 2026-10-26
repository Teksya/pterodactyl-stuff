<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

/** A player's statistics file, in the shape the page shows, from 1.13's format or the one before. */
final class Stats
{
    /**
     * @param  array<mixed>  $file
     * @return array<string, mixed>
     */
    public static function summarise(array $file): array
    {
        [$custom, $mined, $killed, $killedBy, $crafted] = is_array($file['stats'] ?? null) ? self::modern($file['stats']) : self::legacy($file);

        $distances = [];
        foreach ($custom as $key => $value) {
            if (str_ends_with($key, '_one_cm') && $value > 0) {
                $distances[] = ['id' => substr($key, 0, -7), 'blocks' => intdiv($value, 100)];
            }
        }
        usort($distances, fn (array $a, array $b): int => $b['blocks'] <=> $a['blocks']);

        return [
            // play_one_minute counted ticks too, before 1.17 renamed it.
            'playTime' => $custom['play_time'] ?? $custom['play_one_minute'] ?? 0,
            'deaths' => $custom['deaths'] ?? 0,
            'mobKills' => $custom['mob_kills'] ?? 0,
            'playerKills' => $custom['player_kills'] ?? 0,
            // In tenths of a health point.
            'damageDealt' => $custom['damage_dealt'] ?? 0,
            'damageTaken' => $custom['damage_taken'] ?? 0,
            'jumps' => $custom['jump'] ?? 0,
            'timesJoined' => $custom['leave_game'] ?? 0,
            'blocksMined' => array_sum($mined),
            'itemsCrafted' => array_sum($crafted),
            'distances' => $distances,
            'mined' => self::top($mined, 10),
            'killed' => self::top($killed, 10),
            'killedBy' => self::top($killedBy, 5),
        ];
    }

    /**
     * @param  array<mixed>  $stats
     * @return array{array<string, int>, array<string, int>, array<string, int>, array<string, int>, array<string, int>}
     */
    private static function modern(array $stats): array
    {
        $category = function (string $name) use ($stats): array {
            $values = [];
            foreach (is_array($stats["minecraft:{$name}"] ?? null) ? $stats["minecraft:{$name}"] : [] as $key => $value) {
                if (is_numeric($value)) {
                    $values[(string) preg_replace('/^minecraft:/', '', (string) $key)] = (int) $value;
                }
            }

            return $values;
        };

        return [$category('custom'), $category('mined'), $category('killed'), $category('killed_by'), $category('crafted')];
    }

    /**
     * Before 1.13: flat keys such as stat.walkOneCm, stat.mineBlock.minecraft.stone, stat.killEntity.Zombie.
     *
     * @param  array<mixed>  $file
     * @return array{array<string, int>, array<string, int>, array<string, int>, array<string, int>, array<string, int>}
     */
    private static function legacy(array $file): array
    {
        $custom = $mined = $killed = $killedBy = $crafted = [];
        $snake = fn (string $camel): string => strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $camel));

        foreach ($file as $key => $value) {
            if (! is_numeric($value) || ! str_starts_with((string) $key, 'stat.')) {
                continue;
            }
            $parts = explode('.', substr((string) $key, 5), 2);
            $value = (int) $value;
            match ($parts[0]) {
                'mineBlock' => $mined[str_replace('minecraft.', '', $parts[1] ?? '')] = $value,
                'killEntity' => $killed[$snake($parts[1] ?? '')] = $value,
                'entityKilledBy' => $killedBy[$snake($parts[1] ?? '')] = $value,
                'craftItem' => $crafted[str_replace('minecraft.', '', $parts[1] ?? '')] = $value,
                // "walkOneCm" reads as walk_one_cm, "playOneMinute" as play_one_minute, "leaveGame" as leave_game.
                default => isset($parts[1]) ? null : $custom[$snake($parts[0])] = $value,
            };
        }

        return [$custom, $mined, $killed, $killedBy, $crafted];
    }

    /**
     * @param  array<string, int>  $values
     * @return list<array{id: string, count: int}>
     */
    private static function top(array $values, int $count): array
    {
        arsort($values);
        $top = [];
        foreach (array_slice($values, 0, $count, true) as $id => $value) {
            if ($value > 0) {
                $top[] = ['id' => (string) $id, 'count' => $value];
            }
        }

        return $top;
    }
}
