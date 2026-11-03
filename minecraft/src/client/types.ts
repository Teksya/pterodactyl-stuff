/** Wings' power state, or null when Wings did not answer. */
export type PowerState = 'offline' | 'starting' | 'running' | 'stopping' | null;

export interface Overview {
    state: PowerState;
    running: boolean;
    /** Null while the server runs without RCON: only RCON says who is online. */
    online: number | null;
    max: number | null;
    joined: number;
    /** The world's version, from its level.dat. */
    version: string | null;
    /** The message of the day, with its § codes. */
    motd: string | null;
    /** The world folder, server.properties' level-name. */
    world: string;
    rcon: RconStatus;
}

/**
 * How the panel asks the running server what it holds (who is online, a player, the time, the
 * rules, a save before a snapshot): RCON, and nothing else. Actions are commands typed in the
 * console, which need no answer.
 */
export interface RconStatus {
    enabled: boolean;
    port: number | null;
    /** Whether the port is one of the server's allocations, so the panel can reach it. */
    allocated: boolean;
    /** Whether server.properties already has a password, which the user may keep. */
    password: boolean;
    /** Allocation ports the game and query do not use. */
    ports: number[];
    /** ok: the running server answered; off: not turned on; error: on, but asking it failed; idle: the server is not running. */
    state: 'ok' | 'off' | 'error' | 'idle';
    /** Why asking it failed: RCON's words, or the server's answer when it is not the game's. */
    error: string | null;
}

export interface Player {
    uuid: string;
    name: string | null;
    /** Null when it is not known: the server runs without RCON, or is starting or stopping. */
    online: boolean | null;
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
    /**
     * live: asked over RCON now; file: their save, the truth while the server is stopped or RCON says
     * they are offline, their last save otherwise (`online` null: RCON cannot say who plays, or the
     * server is starting or stopping; or, before 1.13, the server cannot be asked); none: RCON lists
     * them online but did not read them (see `liveError`).
     */
    source: 'live' | 'file' | 'none';
    /** The server's power state when the panel looked. */
    state: PowerState;
    rcon: Pick<RconStatus, 'state' | 'error'>;
    /** Why RCON did not read a player it says is online. */
    liveError: string | null;
    /** Parts of a live read RCON did not give in a form the panel reads (too long even alone), which are missing. */
    unread?: { field: string; reason: string }[];
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
    /** Null while the server runs and cannot be asked (before 1.20.5 for the weather). */
    raining?: boolean | null;
    thundering?: boolean | null;
    dayTime?: number | null;
    rules: Record<string, string>;
    state: PowerState;
    /** The time, weather and rules come from the running server, over RCON. */
    live: boolean;
    rcon: RconStatus;
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
    /** last_error: why the last automatic snapshot failed, until one is taken. */
    schedule: { interval_hours: number; keep: number; last_run_at: string | null; last_error: string | null; last_error_at: string | null };
    limits: { manual: number };
    state: PowerState;
    /** A running server is snapshot once RCON had it save its world. */
    rcon: RconStatus;
}
