<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use InvalidArgumentException;
use OlivierDutoit\Minecraft\Nbt\SnbtParser;
use OlivierDutoit\Minecraft\Rcon\RconException;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Models\Server;

/**
 * An online player as the server holds them now, asked over RCON with `data get entity`.
 *
 * Each field is asked whole, all on the request's connection. Some servers cut long answers short (a
 * plugin does: the answer then ends in "..."). A field of items or effects that comes back unreadable
 * is asked again entry by entry, each item or effect alone and in order until the first one missing
 * (a list has no gaps), and an entry still unreadable value by value (its id, count, slot, name,
 * enchantments, wear), so that every answer stays short. What still cannot be read is said in
 * `unread`, rather than shown as an empty slot.
 */
final class LivePlayer
{
    /** The most entries each list holds: the inventory (armour and off hand in it before 1.21.5), the ender chest; effects, one of each kind. */
    private const array LISTS = ['Inventory' => 41, 'EnderItems' => 27, 'active_effects' => 64, 'ActiveEffects' => 64];

    /** What a player wears, from 1.21.5: each key may be missing on its own. */
    private const array EQUIPMENT = ['head', 'chest', 'legs', 'feet', 'offhand'];

    public const string VALUE = 'value';
    public const string NONE = 'none';
    public const string UNREADABLE = 'unreadable';
    public const string OTHER = 'other';

    public function __construct(private readonly ServerRcon $rcon) {}

    /**
     * @param  string  $ask  the command each path follows: `data get entity <name>`, by the name the server gives it
     * @param  array<string, string>  $fields  the path of each field, by the key PlayerProfile::from() reads
     * @return array{entity: array<string, mixed>, unread: list<array{field: string, reason: string}>}
     *
     * @throws RconException when RCON cannot be asked, or no field answered (the player is not there).
     */
    public function read(Server $server, string $ask, array $fields, int $version): array
    {
        $answers = $this->ask($server, $ask, array_values($fields));
        $entity = [];
        $unread = [];
        $split = [];
        foreach ($fields as $key => $path) {
            [$kind, $value] = self::answer($answers[$path], $path);
            if ($kind === self::VALUE) {
                $entity[$key] = $value;
            } elseif ($kind === self::UNREADABLE && (isset(self::LISTS[$path]) || $path === 'equipment')) {
                $split[$key] = $path;
            } elseif ($kind !== self::NONE) {
                $unread[] = ['field' => $path, 'reason' => $value];
            }
        }
        if ($entity === [] && $split === []) {
            // Not one field: the player is not there ("No entity was found").
            throw RconException::answered((string) reset($answers));
        }

        // Each item or effect alone: what is worn all at once, a list in order until its end.
        $values = [];
        $leaves = [];
        foreach ($split as $key => $path) {
            $read = $path === 'equipment' ? $this->ask($server, $ask, self::entries($path)) : [];
            foreach (self::entries($path) as $index => $entry) {
                $answer = $read[$entry] ?? $this->ask($server, $ask, [$entry])[$entry];
                [$kind, $value] = self::answer($answer, $entry);
                if ($kind === self::NONE) {
                    if ($path === 'equipment') {
                        continue;
                    }
                    break;
                }
                if ($path !== 'equipment' && $index === self::LISTS[$path]) {
                    $unread[] = ['field' => $path, 'reason' => 'More than '.self::LISTS[$path].' entries: the rest are not shown.'];
                    break;
                }
                if ($kind === self::VALUE) {
                    $values[$entry] = $value;
                } elseif ($kind === self::UNREADABLE) {
                    foreach (self::leaves($path, $version) as $leaf => $keys) {
                        $leaves["{$entry}.{$leaf}"] = [$entry, $keys];
                    }
                } else {
                    // Another answer (the player left): the rest would answer the same.
                    $unread[] = ['field' => $entry, 'reason' => $value];
                    break;
                }
            }
        }

        // An entry still unreadable, value by value.
        foreach ($this->ask($server, $ask, array_keys($leaves)) as $leaf => $answer) {
            [$entry, $keys] = $leaves[$leaf];
            [$kind, $value] = self::answer($answer, $leaf);
            if ($kind === self::VALUE) {
                $values[$entry] ??= [];
                self::put($values[$entry], $keys, $value);
            } elseif ($kind !== self::NONE) {
                $unread[] = ['field' => $leaf, 'reason' => $value];
            }
        }

        foreach ($split as $key => $path) {
            $read = [];
            foreach (self::entries($path) as $index => $entry) {
                if (isset($values[$entry])) {
                    $read[$path === 'equipment' ? self::EQUIPMENT[$index] : count($read)] = $values[$entry];
                }
            }
            $entity[$key] = $read;
        }

        return ['entity' => $entity, 'unread' => $unread];
    }

    /**
     * What one answer to `data get entity <name> <path>` holds: a value; nothing ("Found no elements
     * matching <path>", that very path: no such field, slot or entry); data that cannot be read, and
     * why; or another answer, which says why.
     *
     * @return array{string, mixed}
     */
    public static function answer(string $answer, string $path): array
    {
        if ($answer === "Found no elements matching {$path}") {
            return [self::NONE, null];
        }
        if (! str_contains($answer, 'has the following entity data')) {
            return [self::OTHER, RconException::answered($answer)->getMessage()];
        }
        try {
            return [self::VALUE, SnbtParser::parseAnswer($answer)];
        } catch (InvalidArgumentException $exception) {
            return [self::UNREADABLE, str_ends_with($answer, '...') ? 'The server cut its answer short.' : $exception->getMessage()];
        }
    }

    /**
     * @param  list<string>  $paths
     * @return array<string, string> each answer, by its path
     */
    private function ask(Server $server, string $ask, array $paths): array
    {
        if ($paths === []) {
            return [];
        }

        return array_combine($paths, $this->rcon->ask($server, array_map(fn (string $path): string => "{$ask} {$path}", $paths)));
    }

    /** @return list<string> the path of each entry a field can hold; for a list, one more than it holds, to know it ends */
    private static function entries(string $path): array
    {
        return $path === 'equipment'
            ? array_map(fn (string $part): string => "equipment.{$part}", self::EQUIPMENT)
            : array_map(fn (int $index): string => "{$path}[{$index}]", range(0, self::LISTS[$path]));
    }

    /**
     * The values of an item or an effect the page shows, each asked alone: its path, by its keys in
     * the entry.
     *
     * @return array<string, list<string>>
     */
    private static function leaves(string $field, int $version): array
    {
        $keys = match (true) {
            $field === 'active_effects' => [['id'], ['amplifier'], ['duration']],
            $field === 'ActiveEffects' => [['Id'], ['Amplifier'], ['Duration']],
            $version === 0 || $version >= PlayerFile::V1_20_5 => [
                ['id'], ['count'],
                ...array_map(fn (string $component): array => ['components', "minecraft:{$component}"], ['custom_name', 'enchantments', 'stored_enchantments', 'damage', 'max_damage', 'unbreakable']),
            ],
            default => [['id'], ['Count'], ['tag', 'display', 'Name'], ['tag', 'Enchantments'], ['tag', 'StoredEnchantments'], ['tag', 'Damage'], ['tag', 'Unbreakable']],
        };
        // An item of the inventory or the ender chest says its slot; one worn is named by its key.
        if (in_array($field, ['Inventory', 'EnderItems'], true)) {
            $keys[] = ['Slot'];
        }

        $leaves = [];
        foreach ($keys as $path) {
            $leaves[implode('.', array_map(fn (string $key): string => preg_match('/^\w+$/', $key) ? $key : "\"{$key}\"", $path))] = $path;
        }

        return $leaves;
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  list<string>  $keys
     */
    private static function put(array &$entry, array $keys, mixed $value): void
    {
        $last = array_pop($keys);
        $node = &$entry;
        foreach ($keys as $key) {
            $node[$key] = is_array($node[$key] ?? null) ? $node[$key] : [];
            $node = &$node[$key];
        }
        $node[$last] = $value;
    }
}
