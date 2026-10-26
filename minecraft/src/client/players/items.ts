import type { Item } from '../types';

/** "minecraft:diamond_sword" as "Diamond sword". */
export function displayName(id: string): string {
    const name = id.replace(/^[a-z0-9_.-]+:/, '').replace(/[_/]/g, ' ');

    return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Up to three letters standing in for the item's picture, such as "DSw" for a diamond sword. */
export function shortName(id: string): string {
    const words = id.replace(/^[a-z0-9_.-]+:/, '').split('_').filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).replace(/^./, (letter) => letter.toUpperCase());

    return words
        .slice(0, 3)
        .map((word, index) => (index === words.length - 1 && words.length === 2 ? word.slice(0, 2) : word[0]))
        .join('')
        .replace(/^./, (letter) => letter.toUpperCase());
}

// The durability of vanilla tools and armour, for items whose data does not carry it (before 1.20.5).
const TOOL_TIERS: Record<string, number> = { wooden: 59, stone: 131, iron: 250, golden: 32, diamond: 1561, netherite: 2031 };
const ARMOR_TIERS: Record<string, [number, number, number, number]> = {
    leather: [55, 80, 75, 65],
    chainmail: [165, 240, 225, 195],
    iron: [165, 240, 225, 195],
    golden: [77, 112, 105, 91],
    diamond: [363, 528, 495, 429],
    netherite: [407, 592, 555, 481],
};
const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];
const OTHERS: Record<string, number> = {
    bow: 384,
    crossbow: 465,
    trident: 250,
    shield: 336,
    elytra: 432,
    fishing_rod: 64,
    flint_and_steel: 64,
    shears: 238,
    carrot_on_a_stick: 25,
    warped_fungus_on_a_stick: 100,
    mace: 500,
    brush: 64,
    turtle_helmet: 275,
    wolf_armor: 64,
};

export function maxDurability(item: Item): number | null {
    if (item.maxDamage !== null) return item.maxDamage;
    const name = item.id.replace(/^minecraft:/, '');
    if (OTHERS[name] !== undefined) return OTHERS[name];

    const [tier, piece] = name.split('_');
    if (piece && ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'].includes(piece) && TOOL_TIERS[tier] !== undefined) return TOOL_TIERS[tier];
    if (piece && ARMOR_TIERS[tier] && ARMOR_PIECES.includes(piece)) return ARMOR_TIERS[tier][ARMOR_PIECES.indexOf(piece)];

    return null;
}

/** What is left of the item's durability, from 0 to 1; null for items that do not wear out. */
export function durability(item: Item): number | null {
    const max = maxDurability(item);
    if (max === null || item.unbreakable || item.damage === null || item.damage === 0) return null;

    return Math.max(0, Math.min(1, (max - item.damage) / max));
}

/** A play time in ticks (1/20 s), as "11d 15h", "3h 20m" or "12m". */
export function playTime(ticks: number): string {
    const minutes = Math.floor(ticks / 20 / 60);
    const [days, hours] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60)];
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;

    return `${minutes}m`;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function level(value: number): string {
    return ROMAN[value] ?? String(value);
}

/** An effect's time left, as the game shows it; ticks are 1/20 s. */
export function effectTime(ticks: number): string {
    if (ticks < 0) return '∞';
    const seconds = Math.floor(ticks / 20);

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Shows that an item is worth a look: enchanted, renamed or a stack. */
export function tone(item: Item): 'enchanted' | 'named' | 'plain' {
    if (item.enchantments.length > 0) return 'enchanted';

    return item.name ? 'named' : 'plain';
}
