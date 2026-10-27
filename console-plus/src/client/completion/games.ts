import type { Game, Value } from './complete';
import { commands, parseVersion, type Usage, type Version } from './grammar';
import { minecraft, PLAYER_LINES, type Flavour } from './minecraft';
import { CARBON, FIVEM, OXIDE, RUST, RUST_ITEMS, TERRARIA, TSHOCK } from './others';
import { playerIds, playerNames, seenPlayers, seenValues, type PlayerLines } from './scan';
import { ARK, COUNTER_STRIKE, GARRYS_MOD, MAPS, SOURCE, TEAM_FORTRESS } from './source';

/** What the extension's API says of the server's game (GameDocument), and its startup command. */
export interface GameInfo {
    egg?: string;
    tags?: string[];
    variables?: Record<string, string>;
    invocation?: string;
}

export type Detected =
    | { game: 'minecraft'; edition: 'java' | 'bedrock' | 'bungee' | 'velocity'; flavours: Flavour[]; version: string | null }
    | { game: 'source'; kind: 'gmod' | 'cs2' | 'csgo' | 'tf2' | 'insurgency' | 'other'; map: string | null }
    | { game: 'ark' }
    | { game: 'rust'; framework: string | null }
    | { game: 'terraria'; tshock: boolean }
    | { game: 'fivem' };

/** The variables that name a Minecraft server's version, in the default eggs and the common ones. */
const VERSION_VARIABLES = ['VANILLA_VERSION', 'MINECRAFT_VERSION', 'MC_VERSION', 'SPONGE_VERSION', 'FORGE_VERSION'];

/** A Minecraft version: 1.x, or the year-numbered ones from 26.1. A Forge build (47.2.0) is not one. */
const minecraftVersion = (version: Version | null) => version !== null && (version[0] === 1 || (version[0] > 25 && version[0] < 100));

/**
 * The game a server runs, by its egg's name, then its tags (minecraft, srcds, rust, garrysmod,
 * fivem, bedrock, voice), its variables and its startup command. Voice servers read no commands.
 */
export function detect(info: GameInfo): Detected | null {
    const egg = (info.egg ?? '').toLowerCase();
    const tags = new Set(info.tags ?? []);
    const variables = info.variables ?? {};
    const sourceGame = (variables.SRCDS_GAME || /-game\s+(\w+)/.exec(info.invocation ?? '')?.[1] || '').toLowerCase();

    if (tags.has('voice') || /teamspeak|\bts3\b|mumble|murmur/.test(egg)) return null;
    if (/bungee|waterfall|flamecord|travertine/.test(egg)) return { game: 'minecraft', edition: 'bungee', flavours: [], version: null };
    if (/velocity/.test(egg)) return { game: 'minecraft', edition: 'velocity', flavours: [], version: null };
    if (tags.has('bedrock') || /bedrock/.test(egg)) return { game: 'minecraft', edition: 'bedrock', flavours: [], version: null };
    if (tags.has('minecraft') || /minecraft|paper|spigot|bukkit|purpur|folia|pufferfish|forge|fabric|quilt|sponge|mohist|magma|arclight/.test(egg)) {
        const flavours: Flavour[] = [];
        if (/neoforge/.test(egg)) flavours.push('neoforge');
        else if (/forge|mohist|magma|arclight|catserver/.test(egg)) flavours.push('forge');
        if (/paper|spigot|bukkit|purpur|folia|pufferfish|mohist|magma|arclight|catserver/.test(egg)) flavours.push('bukkit');
        if (/sponge/.test(egg)) flavours.push('sponge');
        const version = VERSION_VARIABLES.map((name) => variables[name]).find((value) => minecraftVersion(parseVersion(value))) ?? null;

        return { game: 'minecraft', edition: 'java', flavours, version };
    }
    const map = variables.SRCDS_MAP || null;
    if (tags.has('garrysmod') || /garry|gmod/.test(egg) || sourceGame === 'garrysmod') return { game: 'source', kind: 'gmod', map };
    if (/\bark\b|survival evolved/.test(egg)) return { game: 'ark' };
    if (/counter.?strike|\bcs2\b|cs:?go|global offensive/.test(egg) || ['csgo', 'cs2'].includes(sourceGame)) {
        const cs2 = variables.SRCDS_APPID === '730' || sourceGame === 'cs2' || /\bcs2\b|counter-strike 2/.test(egg);
        return { game: 'source', kind: cs2 ? 'cs2' : 'csgo', map };
    }
    if (/team fortress|\btf2\b/.test(egg) || sourceGame === 'tf') return { game: 'source', kind: 'tf2', map };
    if (/insurgency/.test(egg) || sourceGame === 'insurgency') return { game: 'source', kind: 'insurgency', map };
    if (tags.has('srcds') || /source/.test(egg) || sourceGame) return { game: 'source', kind: 'other', map };
    if (tags.has('rust') || /\brust\b/.test(egg)) return { game: 'rust', framework: variables.FRAMEWORK?.toLowerCase() ?? null };
    if (/terraria|tshock/.test(egg)) return { game: 'terraria', tshock: /tshock/.test(egg) };
    if (tags.has('fivem') || /fivem|cfx|fxserver/.test(egg)) return { game: 'fivem' };

    return null;
}

// Valve's log names a player "Name<userid><STEAM_1:0:123><team>"; `status` lists "# 2 "Name" STEAM_1:0:123".
const SOURCE_PLAYERS: PlayerLines = {
    join: [
        /"(?<name>.{1,64}?)<\d+><(?<id>STEAM_[\d:]+|\[U:[\d:]+\])><[^>]*>" (?:connected|entered the game)/,
        /^#\s*\d+\s+(?:\d+\s+)?"(?<name>.{1,64}?)"\s+(?<id>STEAM_[\d:]+|\[U:[\d:]+\])/,
        /Client "(?<name>.{1,64}?)" (?:spawned in server|connected)/,
    ],
    leave: [/"(?<name>.{1,64}?)<\d+><(?<id>STEAM_[\d:]+|\[U:[\d:]+\])><[^>]*>" disconnected/, /Dropped (?<name>.{1,64}?) from server/],
};
const SOURCE_MAPS = [/(?:Started map|Loading map|Map change to|changelevel to)\s*:?\s*"?([\w.-]+)"?/i, /-{4,}\s*Mapchange to ([\w.-]+)/];
// ListPlayers answers "0. Name, 76561198000000011", one line each, or "No Players Connected".
const ARK_PLAYERS: PlayerLines = {
    join: [/(?<name>.{1,64}?) joined this ARK!/, /^\d+\.\s+(?<name>.+?),\s*(?<id>\d{17})\b/],
    leave: [/(?<name>.{1,64}?) left this ARK!/],
    none: [/No Players Connected/i],
};
const RUST_PLAYERS: PlayerLines = {
    join: [/(?<id>\d{17})\/(?<name>.{1,64}?) joined \[/, /^(?<id>\d{17})\s+"(?<name>.{1,64}?)"/],
    leave: [/(?<id>\d{17})\/(?<name>.{1,64}?) disconnecting:/],
};
const RUST_PLUGINS = [/Loaded plugin (.+?) v[\d.]+ by/];
const TERRARIA_PLAYERS: PlayerLines = { join: [/^(.{1,64}?)(?: \([\d.:]+\))? has joined\./], leave: [/^(.{1,64}?) has left\./] };
const FIVEM_RESOURCES = [/Started resource (\S+)/];

const TITLES = { gmod: "Garry's Mod", cs2: 'Counter-Strike 2', csgo: 'Counter-Strike: Global Offensive', tf2: 'Team Fortress 2', insurgency: 'Insurgency', other: 'Source' };

/**
 * The commands of a detected game, in the version given (for Minecraft, the one the server says it
 * runs), with values from the console it reads through `texts`.
 */
export async function loadGame(detected: Detected, version: Version | null, texts: () => string[]): Promise<Game> {
    // One read of the console per completion: the values are asked for once per argument.
    let cache: { texts: string[]; values: Map<string, unknown> } | null = null;
    const seen = <T,>(key: string, read: (texts: string[]) => T): T => {
        const current = texts();
        if (cache?.texts !== current) cache = { texts: current, values: new Map() };
        if (!cache.values.has(key)) cache.values.set(key, read(current));

        return cache.values.get(key) as T;
    };
    const game = (name: string, usages: Usage[], values: Record<string, () => Value[]>, options: Partial<Game> = {}): Game => ({
        name,
        commands: commands(usages),
        values: (kind) => values[kind]?.(),
        ignoreCase: true,
        quote: true,
        ...options,
    });
    // A player argument takes names, a steamid one the Steam ids of the players seen, with their names.
    const players = (lines: PlayerLines) => ({
        player: () => playerNames(seen('players', (all) => seenPlayers(all, lines))),
        steamid: () => playerIds(seen('players', (all) => seenPlayers(all, lines))),
    });

    switch (detected.game) {
        case 'minecraft':
            return minecraft({
                edition: detected.edition,
                flavours: detected.flavours,
                version: version ?? parseVersion(detected.version),
                players: () => seen('players', (lines) => seenPlayers(lines, PLAYER_LINES)),
            });
        case 'source': {
            const extra = { gmod: GARRYS_MOD, cs2: COUNTER_STRIKE, csgo: COUNTER_STRIKE, tf2: TEAM_FORTRESS, insurgency: [], other: [] }[detected.kind];
            const shipped = detected.kind === 'csgo' ? [...MAPS.cs, ...MAPS.csgo] : detected.kind === 'cs2' ? MAPS.cs : (MAPS[detected.kind] ?? []);
            // The map the console last loaded is the current one; the egg's is the one it starts on.
            const maps = () =>
                seen('maps', (lines): Value[] => {
                    const loaded = seenValues(lines, SOURCE_MAPS);
                    const list: Value[] = loaded.map((map, index) => ({ value: map, detail: index === 0 ? 'Current map' : 'Played' }));
                    if (detected.map && !loaded.includes(detected.map)) list.push({ value: detected.map, detail: 'Startup map' });

                    return [...list, ...shipped.filter((map) => map !== detected.map && !loaded.includes(map))];
                });

            return game(TITLES[detected.kind], [...SOURCE, ...extra], { ...players(SOURCE_PLAYERS), map: maps });
        }
        case 'ark':
            return game('ARK: Survival Evolved', ARK, players(ARK_PLAYERS));
        case 'rust': {
            const framework = detected.framework;
            // Without the variable (it may be hidden), both frameworks' commands are offered.
            const usages = [...RUST, ...(framework === 'vanilla' || framework === 'carbon' ? [] : OXIDE), ...(framework === 'vanilla' || framework === 'oxide' ? [] : CARBON)];

            return game('Rust', usages, {
                ...players(RUST_PLAYERS),
                item: () => RUST_ITEMS,
                plugin: () => seen('plugins', (lines) => [{ value: '*', detail: 'Every plugin' }, ...seenValues(lines, RUST_PLUGINS).map((plugin) => plugin.replaceAll(' ', ''))]),
            });
        }
        case 'terraria':
            return game(detected.tshock ? 'Terraria (TShock)' : 'Terraria', detected.tshock ? [...TERRARIA, ...TSHOCK] : TERRARIA, players(TERRARIA_PLAYERS));
        case 'fivem':
            return game('FiveM', FIVEM, { resource: () => seen('resources', (lines) => seenValues(lines, FIVEM_RESOURCES)) }, { ignoreCase: false });
    }
}
