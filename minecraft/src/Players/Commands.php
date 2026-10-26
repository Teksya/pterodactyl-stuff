<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use InvalidArgumentException;

/**
 * The console commands behind each action, as the server's version writes them (1.8 to today).
 * Nothing typed by a user reaches the console as a command: every value is checked against what its
 * place in the command accepts.
 */
final class Commands
{
    public const array PLAYER_ACTIONS = [
        'kick', 'ban', 'pardon', 'op', 'deop', 'whitelist_add', 'whitelist_remove', 'gamemode', 'teleport', 'heal',
        'feed', 'kill', 'clear', 'give', 'remove_slot', 'move', 'effect', 'effect_clear', 'xp', 'message', 'title',
    ];

    public const array WORLD_ACTIONS = ['weather', 'time', 'difficulty', 'gamerule', 'save', 'say'];

    public const string GAMERULE = '/^(?:[a-z0-9_.-]+:)?[A-Za-z0-9_.]{1,64}$/';
    private const string ID = '/^(?:[a-z0-9_.-]+:)?[a-z0-9_.\/-]+$/';
    private const string SLOT = '/^(?:inventory\.(?:[0-9]|[12][0-9]|3[0-5])|ender\.(?:[0-9]|1[0-9]|2[0-6])|armor\.(?:head|chest|legs|feet)|offhand)$/';

    /**
     * @param  array<string, mixed>  $input
     * @param  int  $version  the world's data version; 0 when unknown (taken as current).
     * @return list<string>
     */
    public static function player(string $name, string $action, array $input, int $version = 0): array
    {
        Players::assertName($name);
        $modern = $version === 0 || $version >= PlayerFile::V1_13;

        return match ($action) {
            'kick' => [self::withText("kick {$name}", $input['reason'] ?? null)],
            'ban' => [self::withText("ban {$name}", $input['reason'] ?? null)],
            'pardon' => ["pardon {$name}"],
            'op' => ["op {$name}"],
            'deop' => ["deop {$name}"],
            'whitelist_add' => ["whitelist add {$name}"],
            'whitelist_remove' => ["whitelist remove {$name}"],
            'gamemode' => ['gamemode '.self::gamemode($input['mode'] ?? null)." {$name}"],
            'teleport' => [self::teleport($name, $input, $modern)],
            // Instant health and saturation heal and feed fully in one tick; numbers before 1.13.
            'heal' => [$modern ? "effect give {$name} minecraft:instant_health 1 10 true" : "effect {$name} 6 1 10 true"],
            'feed' => [$modern ? "effect give {$name} minecraft:saturation 1 10 true" : "effect {$name} 23 1 10 true"],
            'kill' => ["kill {$name}"],
            'clear' => [is_string($input['item'] ?? null) && $input['item'] !== '' ? "clear {$name} ".self::id($input['item'], 'item') : "clear {$name}"],
            'give' => ["give {$name} ".self::id($input['item'] ?? null, 'item').' '.self::integer($input['count'] ?? 1, 1, 6400, 'count')],
            'remove_slot' => [self::emptySlot($name, self::slot($input['slot'] ?? null), $version)],
            'move' => self::move($name, self::slot($input['from'] ?? null), self::slot($input['to'] ?? null), $version),
            'effect' => [sprintf(
                $modern ? 'effect give %1$s %2$s %3$d %4$d' : 'effect %1$s %2$s %3$d %4$d',
                $name,
                self::id($input['effect'] ?? null, 'effect'),
                self::integer($input['seconds'] ?? 30, 1, 1000000, 'duration'),
                self::integer($input['amplifier'] ?? 0, 0, 255, 'level'),
            )],
            'effect_clear' => [$modern ? "effect clear {$name}" : "effect {$name} clear"],
            'xp' => [self::xp($name, self::integer($input['amount'] ?? 0, -100000, 100000, 'amount'), self::oneOf($input['unit'] ?? 'levels', ['levels', 'points'], 'unit'), $modern)],
            'message' => ["tell {$name} ".self::text($input['text'] ?? null)],
            'title' => ["title {$name} title ".json_encode(['text' => self::text($input['text'] ?? null)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
            default => throw new InvalidArgumentException("Unknown player action \"{$action}\"."),
        };
    }

    /**
     * @param  array<string, mixed>  $input
     * @return list<string>
     */
    public static function world(string $action, array $input): array
    {
        return match ($action) {
            'weather' => ['weather '.self::oneOf($input['weather'] ?? null, ['clear', 'rain', 'thunder'], 'weather')],
            'time' => ['time set '.self::oneOf($input['time'] ?? null, ['day', 'noon', 'night', 'midnight'], 'time')],
            'difficulty' => ['difficulty '.self::oneOf($input['difficulty'] ?? null, ['peaceful', 'easy', 'normal', 'hard'], 'difficulty')],
            'gamerule' => ['gamerule '.self::gamerule($input['rule'] ?? null).' '.self::gameruleValue($input['value'] ?? null)],
            'save' => ['save-all'],
            'say' => ['say '.self::text($input['text'] ?? null)],
            default => throw new InvalidArgumentException("Unknown world action \"{$action}\"."),
        };
    }

    public static function gamerule(mixed $rule): string
    {
        if (! is_string($rule) || ! preg_match(self::GAMERULE, $rule)) {
            throw new InvalidArgumentException('That is not a game rule.');
        }

        return $rule;
    }

    public static function gamemode(mixed $mode): string
    {
        return self::oneOf($mode, ['survival', 'creative', 'adventure', 'spectator'], 'game mode');
    }

    /** An item, effect or dimension id, such as minecraft:diamond. */
    public static function id(mixed $value, string $what): string
    {
        $value = is_string($value) ? strtolower(trim($value)) : '';
        if (! preg_match(self::ID, $value) || strlen($value) > 128) {
            throw new InvalidArgumentException("That is not a valid {$what} id, such as minecraft:diamond.");
        }

        return str_contains($value, ':') ? $value : "minecraft:{$value}";
    }

    /** A slot as the API names it: inventory.0-35, armor.head/chest/legs/feet, offhand, ender.0-26. */
    public static function slot(mixed $value): string
    {
        if (! is_string($value) || ! preg_match(self::SLOT, $value)) {
            throw new InvalidArgumentException('That is not an inventory slot.');
        }

        return $value;
    }

    public static function integer(mixed $value, int $min, int $max, string $what): int
    {
        if (! is_numeric($value) || (int) $value != $value || $value < $min || $value > $max) {
            throw new InvalidArgumentException("The {$what} must be a whole number from {$min} to {$max}.");
        }

        return (int) $value;
    }

    public static function coordinate(mixed $value, string $axis): float
    {
        if (! is_numeric($value) || abs((float) $value) > 30000000) {
            throw new InvalidArgumentException("The {$axis} coordinate must be a number within the world border.");
        }

        return round((float) $value, 3);
    }

    /** One line of text: a command ends at a line break, so line breaks and other control characters go. */
    public static function text(mixed $value): string
    {
        $text = trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', is_string($value) ? $value : ''));
        if ($text === '' || mb_strlen($text) > 256) {
            throw new InvalidArgumentException('Write a message of 1 to 256 characters.');
        }

        return $text;
    }

    /** The slot as the `item` and `replaceitem` commands name it. */
    public static function commandSlot(string $slot, int $version): string
    {
        $name = match (true) {
            str_starts_with($slot, 'inventory.') => (int) substr($slot, 10) < 9 ? 'hotbar.'.substr($slot, 10) : 'inventory.'.((int) substr($slot, 10) - 9),
            str_starts_with($slot, 'ender.') => 'enderchest.'.substr($slot, 6),
            $slot === 'offhand' => 'weapon.offhand',
            default => $slot,
        };

        // Before 1.13, slot names started with "slot.".
        return $version !== 0 && $version < PlayerFile::V1_13 ? "slot.{$name}" : $name;
    }

    private static function emptySlot(string $name, string $slot, int $version): string
    {
        $target = self::commandSlot($slot, $version);

        // `item` replaced `replaceitem` in 1.17.
        return $version === 0 || $version >= PlayerFile::V1_17
            ? "item replace entity {$name} {$target} with minecraft:air"
            : "replaceitem entity {$name} {$target} minecraft:air";
    }

    /**
     * Copies the item to the empty slot, then empties the one it came from. The caller makes sure the
     * target is empty: a command cannot swap two items.
     *
     * @return list<string>
     */
    private static function move(string $name, string $from, string $to, int $version): array
    {
        if ($version !== 0 && $version < PlayerFile::V1_17) {
            throw new InvalidArgumentException('Moving items of a player who is online takes Minecraft 1.17 or later. Move them while the player is offline.');
        }
        if ($from === $to) {
            throw new InvalidArgumentException('Pick another slot.');
        }

        return [
            "item replace entity {$name} ".self::commandSlot($to, $version)." from entity {$name} ".self::commandSlot($from, $version),
            self::emptySlot($name, $from, $version),
        ];
    }

    /** @param array<string, mixed> $input */
    private static function teleport(string $name, array $input, bool $modern): string
    {
        if (isset($input['to']) && $input['to'] !== '') {
            if (! is_string($input['to'])) {
                throw new InvalidArgumentException('Pick a player to teleport to.');
            }
            Players::assertName($input['to']);

            return "tp {$name} {$input['to']}";
        }

        $coordinates = implode(' ', array_map(fn (string $axis): string => (string) self::coordinate($input[$axis] ?? null, $axis), ['x', 'y', 'z']));
        if (is_string($input['dimension'] ?? null) && $input['dimension'] !== '') {
            if (! $modern) {
                throw new InvalidArgumentException('Teleporting to another dimension takes Minecraft 1.13 or later.');
            }

            return 'execute in '.self::id($input['dimension'], 'dimension')." run tp {$name} {$coordinates}";
        }

        return "tp {$name} {$coordinates}";
    }

    private static function xp(string $name, int $amount, string $unit, bool $modern): string
    {
        if ($modern) {
            return "xp add {$name} {$amount} {$unit}";
        }

        // Before 1.13: levels end in L, and points cannot be taken away.
        if ($unit === 'points' && $amount < 0) {
            throw new InvalidArgumentException('This version cannot take points away; take levels instead.');
        }

        return $unit === 'levels' ? "xp {$amount}L {$name}" : "xp {$amount} {$name}";
    }

    private static function gameruleValue(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        $value = is_scalar($value) ? (string) $value : '';
        if (in_array($value, ['true', 'false'], true) || preg_match('/^-?\d{1,10}$/', $value)) {
            return $value;
        }

        throw new InvalidArgumentException('A game rule is true, false or a whole number.');
    }

    /** @param list<string> $values */
    private static function oneOf(mixed $value, array $values, string $what): string
    {
        if (! in_array($value, $values, true)) {
            throw new InvalidArgumentException("Pick a {$what}: ".implode(', ', $values).'.');
        }

        return $value;
    }

    private static function withText(string $command, mixed $text): string
    {
        return is_string($text) && trim($text) !== '' ? $command.' '.self::text($text) : $command;
    }
}
