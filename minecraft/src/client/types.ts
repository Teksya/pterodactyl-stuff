export interface Overview {
    running: boolean;
    online: number;
    max: number | null;
    joined: number;
    /** The version the server reports, such as "Paper 1.21.4". */
    version: string | null;
    /** The message of the day, with its § codes. */
    motd: string | null;
    /** The world folder, server.properties' level-name. */
    world: string;
    rcon: RconStatus;
}

/** RCON reads online players at once and silently; without it the panel reads the console back. */
export interface RconStatus {
    enabled: boolean;
    port: number | null;
    /** Whether the port is one of the server's allocations, so the panel can reach it. */
    allocated: boolean;
    /** Allocation ports the game and query do not use. */
    ports: number[];
}

export interface Player {
    uuid: string;
    name: string | null;
    online: boolean;
    /** The operator level, or null. */
    op: number | null;
    whitelisted: boolean;
    /** The ban reason, or null. */
    banned: string | null;
    /** When the player's file was last saved. */
    lastSeen: string | null;
}

export interface Enchantment {
    id: string;
    level: number;
}

/** inventory.0-35 (0-8 the hotbar), armor.head/chest/legs/feet, offhand, ender.0-26. */
export type Slot = string;

export interface Item {
    slot: Slot;
    id: string;
    count: number;
    name: string | null;
    enchantments: Enchantment[];
    damage: number | null;
    maxDamage: number | null;
    unbreakable: boolean;
}

export interface Effect {
    id: string;
    amplifier: number;
    /** In ticks; -1 for an infinite effect. */
    duration: number;
}

export type ArmorPart = 'head' | 'chest' | 'legs' | 'feet';
export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

export interface Ranked {
    id: string;
    count: number;
}

export interface Stats {
    playTime: number;
    deaths: number;
    mobKills: number;
    playerKills: number;
    /** In tenths of a health point. */
    damageDealt: number;
    damageTaken: number;
    jumps: number;
    timesJoined: number;
    blocksMined: number;
    itemsCrafted: number;
    distances: { id: string; blocks: number }[];
    mined: Ranked[];
    killed: Ranked[];
    killedBy: Ranked[];
}

export interface Profile extends Player {
    /** False for a player the server never saved: one only on a list, or who just joined. */
    saved: boolean;
    /** live: read over RCON while the player is online; file: as the server last saved them. */
    source?: 'live' | 'file';
    /**
     * For a player online, how the live reading went: over `rcon`, `off` (RCON is off: the file is
     * shown), `error` (RCON did not answer), `unsupported` (before 1.13). Null for one offline.
     */
    liveVia?: 'rcon' | 'console' | 'off' | 'error' | 'unsupported' | null;
    /** Why the live reading failed, when it did. */
    liveError?: string | null;
    /** Why the player's file could not be read, when it could not. */
    readError?: string | null;
    health?: number | null;
    maxHealth?: number;
    food?: number | null;
    saturation?: number | null;
    xpLevel?: number | null;
    xpProgress?: number | null;
    air?: number | null;
    gamemode?: GameMode | null;
    flying?: boolean;
    position?: { x: number; y: number; z: number } | null;
    dimension?: string | null;
    selectedSlot?: number | null;
    effects?: Effect[];
    inventory?: Item[];
    armor?: Record<ArmorPart, Item | null>;
    offhand?: Item | null;
    enderItems?: Item[];
    stats: Stats | null;
    /** The world's version, from level.dat. */
    version: string | null;
}

export interface WorldInfo {
    found: boolean;
    name?: string;
    version?: string | null;
    seed?: string | null;
    spawn?: { x: number; y: number; z: number } | null;
    hardcore?: boolean;
    raining?: boolean;
    thundering?: boolean;
    dayTime?: number | null;
    rules: Record<string, string>;
}

export interface IpBan {
    ip: string;
    created?: string;
    source?: string;
    expires?: string;
    reason?: string;
}

export interface ActionResult {
    message: string;
    command: string | null;
}

export interface WorldFolder {
    folder: string;
    /** The world's folder and its dimensions' (world_nether, world_the_end). */
    folders: string[];
    active: boolean;
    found: boolean;
    name: string;
    version: string | null;
    seed: string | null;
    hardcore: boolean;
    gameMode: string | null;
    lastPlayed: string | null;
}

export interface Snapshot {
    uuid: string;
    name: string;
    worlds: string[];
    size: number | null;
    version: string | null;
    automatic: boolean;
    /** The archive, from the server's root. */
    path: string;
    created_at: string;
    /** The archive is gone from the .snapshots folder. */
    missing: boolean;
}

export interface WorldsData {
    active: string;
    worlds: WorldFolder[];
    snapshots: Snapshot[];
    schedule: { interval_hours: number; keep: number; last_run_at: string | null };
    limits: { manual: number };
}
