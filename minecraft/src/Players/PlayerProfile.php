<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

/**
 * A player entity's NBT, saved or live, in one shape whatever the Minecraft version: items before and
 * after 1.20.5's components, armour in the inventory before 1.21.5 and in `equipment` after it, and
 * effects by number before 1.20.2 and by name after.
 */
final class PlayerProfile
{
    // Effect numbers before 1.20.2.
    private const array EFFECTS = [
        1 => 'speed', 'slowness', 'haste', 'mining_fatigue', 'strength', 'instant_health', 'instant_damage', 'jump_boost',
        'nausea', 'regeneration', 'resistance', 'fire_resistance', 'water_breathing', 'invisibility', 'blindness',
        'night_vision', 'hunger', 'weakness', 'poison', 'wither', 'health_boost', 'absorption', 'saturation', 'glowing',
        'levitation', 'luck', 'unluck', 'slow_falling', 'conduit_power', 'dolphins_grace', 'bad_omen',
        'hero_of_the_village', 'darkness',
    ];

    private const array ARMOR_SLOTS = [100 => 'feet', 101 => 'legs', 102 => 'chest', 103 => 'head'];
    private const int OFFHAND_SLOT = -106;

    /**
     * The fields a live profile reads, one `data get` each (the whole entity holds the large recipe
     * book), named as the world's version names them.
     *
     * @return list<string>
     */
    public static function livePaths(int $version): array
    {
        $modern = $version === 0 || $version >= PlayerFile::V1_20_5;

        return [
            'Health', 'foodLevel', 'XpLevel', 'XpP', 'Pos', 'Dimension', 'playerGameType', 'SelectedItemSlot', 'Air',
            'Inventory', 'EnderItems',
            ...($version === 0 || $version >= PlayerFile::V1_21_5 ? ['equipment'] : []),
            // Effects by name from 1.20.2, attributes in lower case from 1.20.5.
            $version === 0 || $version >= 3758 ? 'active_effects' : 'ActiveEffects',
            $modern ? 'attributes' : 'Attributes',
        ];
    }

    /**
     * Items carry their slot as the API names it: inventory.0-35, armor.head/chest/legs/feet, offhand,
     * ender.0-26.
     *
     * @param  array<string, mixed>  $entity
     * @return array<string, mixed>
     */
    public static function from(array $entity): array
    {
        $inventory = [];
        $armor = ['head' => null, 'chest' => null, 'legs' => null, 'feet' => null];
        $offhand = null;

        foreach (self::items($entity['Inventory'] ?? [], 'inventory') as $item) {
            $number = $item['number'];
            unset($item['number']);
            if (isset(self::ARMOR_SLOTS[$number])) {
                $armor[self::ARMOR_SLOTS[$number]] = ['slot' => 'armor.'.self::ARMOR_SLOTS[$number]] + $item;
            } elseif ($number === self::OFFHAND_SLOT) {
                $offhand = ['slot' => 'offhand'] + $item;
            } elseif ($number >= 0 && $number <= 35) {
                $inventory[] = $item;
            }
        }

        $equipment = is_array($entity['equipment'] ?? null) ? $entity['equipment'] : [];
        foreach (array_keys($armor) as $part) {
            if (is_array($equipment[$part] ?? null) && isset($equipment[$part]['id'])) {
                $armor[$part] = self::item($equipment[$part], "armor.{$part}");
            }
        }
        if (is_array($equipment['offhand'] ?? null) && isset($equipment['offhand']['id'])) {
            $offhand = self::item($equipment['offhand'], 'offhand');
        }

        $enderItems = array_map(function (array $item): array {
            unset($item['number']);

            return $item;
        }, self::items($entity['EnderItems'] ?? [], 'ender'));

        $position = is_array($entity['Pos'] ?? null) ? array_values($entity['Pos']) : [];
        $abilities = is_array($entity['abilities'] ?? null) ? $entity['abilities'] : [];

        return [
            'health' => self::number($entity['Health'] ?? null),
            'maxHealth' => self::maxHealth($entity),
            'food' => self::number($entity['foodLevel'] ?? null),
            'saturation' => self::number($entity['foodSaturationLevel'] ?? null),
            'xpLevel' => self::number($entity['XpLevel'] ?? null),
            'xpProgress' => self::number($entity['XpP'] ?? null),
            'air' => self::number($entity['Air'] ?? null),
            'gamemode' => self::gamemode($entity['playerGameType'] ?? null),
            'flying' => (bool) ($abilities['flying'] ?? false),
            'position' => count($position) >= 3 && is_numeric($position[0]) && is_numeric($position[1]) && is_numeric($position[2])
                ? ['x' => self::number((float) $position[0]) ?? 0, 'y' => self::number((float) $position[1]) ?? 0, 'z' => self::number((float) $position[2]) ?? 0]
                : null,
            'dimension' => self::dimension($entity['Dimension'] ?? null),
            'selectedSlot' => self::number($entity['SelectedItemSlot'] ?? null),
            'effects' => self::effects($entity['active_effects'] ?? $entity['ActiveEffects'] ?? []),
            'inventory' => $inventory,
            'armor' => $armor,
            'offhand' => $offhand,
            'enderItems' => $enderItems,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function items(mixed $list, string $prefix): array
    {
        if (! is_array($list)) {
            return [];
        }

        $items = [];
        foreach ($list as $index => $entry) {
            if (is_array($entry) && isset($entry['id']) && $entry['id'] !== 'minecraft:air') {
                $number = (int) ($entry['Slot'] ?? $entry['slot'] ?? $index);
                $items[] = self::item($entry, "{$prefix}.{$number}") + ['number' => $number];
            }
        }

        return $items;
    }

    /**
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    private static function item(array $entry, string $slot): array
    {
        $components = is_array($entry['components'] ?? null) ? $entry['components'] : [];
        $tag = is_array($entry['tag'] ?? null) ? $entry['tag'] : [];

        $enchantments = self::enchantments($components['minecraft:enchantments'] ?? $tag['Enchantments'] ?? []);
        $stored = self::enchantments($components['minecraft:stored_enchantments'] ?? $tag['StoredEnchantments'] ?? []);
        $name = $components['minecraft:custom_name'] ?? ($tag['display']['Name'] ?? null);

        return [
            'slot' => $slot,
            // Before 1.8, ids were numbers.
            'id' => is_numeric($entry['id']) ? 'minecraft:unknown_'.$entry['id'] : (string) $entry['id'],
            'count' => (int) ($entry['count'] ?? $entry['Count'] ?? 1),
            'name' => $name === null ? null : self::text($name),
            'enchantments' => [...$enchantments, ...$stored],
            'damage' => isset($components['minecraft:damage']) || isset($tag['Damage']) ? (int) ($components['minecraft:damage'] ?? $tag['Damage']) : null,
            'maxDamage' => isset($components['minecraft:max_damage']) ? (int) $components['minecraft:max_damage'] : null,
            'unbreakable' => isset($components['minecraft:unbreakable']) || ! empty($tag['Unbreakable']),
        ];
    }

    /**
     * Before 1.20.5 a list of `{id, lvl}`; from 1.20.5 `{levels: {id: level}}`, and from 1.21.5 `{id: level}`.
     *
     * @return list<array{id: string, level: int}>
     */
    private static function enchantments(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }
        if (isset($value['levels']) && is_array($value['levels'])) {
            $value = $value['levels'];
        }

        $enchantments = [];
        foreach ($value as $key => $entry) {
            if (is_array($entry) && isset($entry['id'])) {
                $enchantments[] = ['id' => (string) $entry['id'], 'level' => (int) ($entry['lvl'] ?? 1)];
            } elseif (is_string($key) && is_numeric($entry)) {
                $enchantments[] = ['id' => $key, 'level' => (int) $entry];
            }
        }

        return $enchantments;
    }

    /**
     * @return list<array{id: string, amplifier: int, duration: int}>
     */
    private static function effects(mixed $list): array
    {
        if (! is_array($list)) {
            return [];
        }

        $effects = [];
        foreach ($list as $effect) {
            if (! is_array($effect)) {
                continue;
            }
            $id = $effect['id'] ?? $effect['Id'] ?? null;
            if (is_int($id)) {
                $id = isset(self::EFFECTS[$id]) ? 'minecraft:'.self::EFFECTS[$id] : "effect {$id}";
            }
            if (! is_string($id)) {
                continue;
            }
            $effects[] = [
                'id' => $id,
                'amplifier' => (int) ($effect['amplifier'] ?? $effect['Amplifier'] ?? 0),
                'duration' => (int) ($effect['duration'] ?? $effect['Duration'] ?? 0),
            ];
        }

        return $effects;
    }

    /** A text component (JSON before 1.21.5, NBT after) as plain text. */
    private static function text(mixed $value): string
    {
        // A plain name such as "true" is not JSON to decode: only objects, lists and quoted strings are.
        if (is_string($value)) {
            if (! in_array(ltrim($value)[0] ?? '', ['{', '[', '"'], true)) {
                return $value;
            }
            $decoded = json_decode($value, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return $value;
            }
            $value = $decoded;
        }
        if (is_string($value) || is_numeric($value)) {
            return (string) $value;
        }
        if (! is_array($value)) {
            return '';
        }
        if (array_is_list($value)) {
            return implode('', array_map(self::text(...), $value));
        }

        return (string) ($value['text'] ?? $value['translate'] ?? '').implode('', array_map(self::text(...), is_array($value['extra'] ?? null) ? $value['extra'] : []));
    }

    /** @param array<string, mixed> $entity */
    private static function maxHealth(array $entity): float
    {
        foreach ([$entity['attributes'] ?? [], $entity['Attributes'] ?? []] as $attributes) {
            if (! is_array($attributes)) {
                continue;
            }
            foreach ($attributes as $attribute) {
                $id = is_array($attribute) ? ($attribute['id'] ?? $attribute['Name'] ?? '') : '';
                if (in_array($id, ['minecraft:max_health', 'minecraft:generic.max_health', 'generic.maxHealth'], true)) {
                    return (float) ($attribute['base'] ?? $attribute['Base'] ?? 20);
                }
            }
        }

        return 20.0;
    }

    private static function gamemode(mixed $value): ?string
    {
        return is_numeric($value) ? (['survival', 'creative', 'adventure', 'spectator'][(int) $value] ?? null) : null;
    }

    private static function dimension(mixed $value): ?string
    {
        if (is_string($value)) {
            return $value;
        }

        // A number before 1.16.
        return is_numeric($value) ? ([-1 => 'minecraft:the_nether', 0 => 'minecraft:overworld', 1 => 'minecraft:the_end'][(int) $value] ?? null) : null;
    }

    private static function number(mixed $value): int|float|null
    {
        // NaN and infinity cannot go into JSON.
        return is_int($value) || (is_float($value) && is_finite($value)) ? $value : null;
    }
}
