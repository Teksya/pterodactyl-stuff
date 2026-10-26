<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Players;

use InvalidArgumentException;
use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Nbt\Tag;

/**
 * A player's saved file (world/playerdata/<uuid>.dat, world/players/data/<uuid>.dat from 26.1), changed
 * while the player is away. Each change
 * keeps the format of the version that wrote the file: item counts and ids before and after 1.13 and
 * 1.20.5, armour in the inventory before 1.21.5 and in `equipment` after it.
 *
 * Slots are named as the API names them: inventory.0-35 (0-8 the hotbar), armor.head/chest/legs/feet,
 * offhand and ender.0-26.
 */
final class PlayerFile
{
    public const int V1_13 = 1519;
    public const int V1_17 = 2724;
    public const int V1_20_5 = 3837;
    public const int V1_21_5 = 4325;

    private const array ARMOR_SLOTS = ['feet' => 100, 'legs' => 101, 'chest' => 102, 'head' => 103];
    private const int OFFHAND_SLOT = -106;
    private const array GAME_MODES = ['survival' => 0, 'creative' => 1, 'adventure' => 2, 'spectator' => 3];

    private function __construct(public readonly Tag $root) {}

    public static function load(string $contents): self
    {
        return new self(Nbt::read($contents));
    }

    public function contents(): string
    {
        return Nbt::write($this->root);
    }

    /** The game version that wrote the file; files before 1.9 have none. */
    public function dataVersion(): int
    {
        return (int) ($this->root->get('DataVersion')?->value ?? 0);
    }

    public function gamemode(string $mode): void
    {
        if (! isset(self::GAME_MODES[$mode])) {
            throw new InvalidArgumentException('Pick a game mode: survival, creative, adventure or spectator.');
        }
        $this->root->set('playerGameType', Tag::int(self::GAME_MODES[$mode]));
    }

    /** Full health, as the player's maximum (20, or more with health boosts saved in its attributes). */
    public function heal(float $maxHealth): void
    {
        $health = $this->root->get('Health');
        $this->root->set('Health', $health ? $health->withNumber($maxHealth) : Tag::float($maxHealth));
        // 1.8 kept the health a second time, as a float.
        if ($this->root->get('HealF')) {
            $this->root->set('HealF', Tag::float($maxHealth));
        }
        $this->root->set('Fire', ($this->root->get('Fire') ?? Tag::short(0))->withNumber(-20));
    }

    public function feed(): void
    {
        $this->root->set('foodLevel', Tag::int(20));
        $this->root->set('foodSaturationLevel', Tag::float(5.0));
        $this->root->set('foodExhaustionLevel', Tag::float(0.0));
    }

    public function teleport(float $x, float $y, float $z, ?string $dimension): void
    {
        $this->root->set('Pos', Tag::list(Tag::DOUBLE, [Tag::double($x), Tag::double($y), Tag::double($z)]));
        $this->root->set('Motion', Tag::list(Tag::DOUBLE, [Tag::double(0), Tag::double(0), Tag::double(0)]));
        if ($dimension === null) {
            return;
        }

        $current = $this->root->get('Dimension');
        if ($current && $current->type === Tag::INT) {
            // A number before 1.16.
            $numbers = ['minecraft:overworld' => 0, 'minecraft:the_nether' => -1, 'minecraft:the_end' => 1];
            if (! isset($numbers[$dimension])) {
                throw new InvalidArgumentException('This version only has the overworld, the Nether and the End.');
            }
            $this->root->set('Dimension', Tag::int($numbers[$dimension]));
        } else {
            $this->root->set('Dimension', Tag::string($dimension));
        }
    }

    public function addLevels(int $levels): void
    {
        $current = (int) ($this->root->get('XpLevel')?->value ?? 0);
        $this->root->set('XpLevel', Tag::int(max(0, $current + $levels)));
        $this->root->set('XpP', Tag::float(0.0));
    }

    public function clearEffects(): void
    {
        $this->root->remove('active_effects')->remove('ActiveEffects');
    }

    /** Empties the inventory, armour and off hand, or only their items of `$id`; the ender chest stays. */
    public function clearInventory(?string $id = null): void
    {
        $keep = fn (Tag $item): bool => $id !== null && $item->get('id')?->value !== $id;

        $inventory = $this->root->get('Inventory')?->value ?? [];
        $this->root->set('Inventory', Tag::list(Tag::COMPOUND, array_values(array_filter($inventory, $keep))));
        if ($equipment = $this->root->get('equipment')) {
            $this->root->set('equipment', Tag::compound(array_filter($equipment->value, $keep)));
        }
    }

    public function item(string $slot): ?Tag
    {
        [$list, $key] = $this->locate($slot);
        if ($list === 'equipment') {
            return $this->root->get('equipment')?->get($key);
        }

        foreach ($this->root->get($list)?->value ?? [] as $item) {
            if ((int) ($item->get('Slot')?->value ?? -999) === $key) {
                return $item;
            }
        }

        return null;
    }

    /** Puts `$item` in `$slot`, replacing what is there; null empties it. */
    public function put(string $slot, ?Tag $item): void
    {
        [$list, $key] = $this->locate($slot);
        if ($list === 'equipment') {
            $equipment = $this->root->get('equipment') ?? Tag::compound();
            if ($item === null) {
                $equipment->remove($key);
            } else {
                $equipment->set($key, $this->withoutSlot($item));
            }
            $this->root->set('equipment', $equipment);

            return;
        }

        $tag = $this->root->get($list) ?? Tag::list(Tag::COMPOUND);
        $items = array_values(array_filter($tag->value, fn (Tag $existing): bool => (int) ($existing->get('Slot')?->value ?? -999) !== $key));
        if ($item !== null) {
            $copy = Tag::compound($item->value);
            $copy->set('Slot', Tag::byte($key));
            $items[] = $copy;
        }
        $this->root->set($list, Tag::list(Tag::COMPOUND, $items));
    }

    /** Moves the item in `$from` to `$to`, swapping with what is there. */
    public function move(string $from, string $to): void
    {
        $moving = $this->item($from);
        if ($moving === null) {
            throw new InvalidArgumentException('That slot is empty.');
        }
        $other = $this->item($to);
        $this->put($from, $other);
        $this->put($to, $moving);
    }

    /**
     * Adds `$count` of `$id` to `$slot`, or to the first free slot of the hotbar then the inventory.
     *
     * @return string the slot it went to.
     */
    public function give(string $id, int $count, ?string $slot = null): string
    {
        if ($slot === null) {
            for ($index = 0; $index < 36 && $slot === null; $index++) {
                if ($this->item("inventory.{$index}") === null) {
                    $slot = "inventory.{$index}";
                }
            }
            if ($slot === null) {
                throw new InvalidArgumentException('The inventory is full.');
            }
        }

        $this->put($slot, $this->newItem($id, $count));

        return $slot;
    }

    /** An item in the format of the file's version. */
    private function newItem(string $id, int $count): Tag
    {
        $version = $this->dataVersion();
        if ($version >= self::V1_20_5) {
            return Tag::compound(['id' => Tag::string($id), 'count' => Tag::int($count)]);
        }

        $item = ['id' => Tag::string($id), 'Count' => Tag::byte(min($count, 127))];
        if ($version < self::V1_13) {
            $item['Damage'] = Tag::short(0);
        }

        return Tag::compound($item);
    }

    private function withoutSlot(Tag $item): Tag
    {
        return Tag::compound($item->value)->remove('Slot');
    }

    /**
     * Where a slot lives in the file: the list and the Slot number, or the `equipment` key.
     *
     * @return array{string, int|string}
     */
    private function locate(string $slot): array
    {
        $modern = $this->dataVersion() >= self::V1_21_5 || $this->root->get('equipment') !== null;

        if (preg_match('/^inventory\.(\d{1,2})$/', $slot, $match) && (int) $match[1] <= 35) {
            return ['Inventory', (int) $match[1]];
        }
        if (preg_match('/^ender\.(\d{1,2})$/', $slot, $match) && (int) $match[1] <= 26) {
            return ['EnderItems', (int) $match[1]];
        }
        if (preg_match('/^armor\.(head|chest|legs|feet)$/', $slot, $match)) {
            return $modern ? ['equipment', $match[1]] : ['Inventory', self::ARMOR_SLOTS[$match[1]]];
        }
        if ($slot === 'offhand') {
            return $modern ? ['equipment', 'offhand'] : ['Inventory', self::OFFHAND_SLOT];
        }

        throw new InvalidArgumentException("\"{$slot}\" is not an inventory slot.");
    }
}
