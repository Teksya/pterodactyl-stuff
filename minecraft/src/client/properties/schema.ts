export type Field =
    | { kind: 'text'; placeholder?: string }
    | { kind: 'motd' }
    | { kind: 'secret' }
    | { kind: 'number'; min?: number; max?: number }
    | { kind: 'toggle' }
    | { kind: 'select'; options: { value: string; label: string }[] };

export interface Property {
    key: string;
    label: string;
    help?: string;
    field: Field;
    /** Shown even when the file does not have the key yet; the others only when it does. */
    always?: boolean;
    /** Set by the panel from the server's allocation each time it starts. */
    managed?: boolean;
}

export interface Section {
    id: string;
    title: string;
    properties: Property[];
}

const toggle: Field = { kind: 'toggle' };
const options = (...values: [string, string][]): Field => ({ kind: 'select', options: values.map(([value, label]) => ({ value, label })) });

export const SECTIONS: Section[] = [
    {
        id: 'general',
        title: 'General',
        properties: [
            { key: 'motd', label: 'Message of the day', help: 'Shown under the server\'s name in the server list. § codes colour it; a second line goes after \\n.', field: { kind: 'motd' }, always: true },
            { key: 'max-players', label: 'Maximum players', field: { kind: 'number', min: 0, max: 100000 }, always: true },
            { key: 'gamemode', label: 'Game mode', help: 'The mode of players joining for the first time.', field: options(['survival', 'Survival'], ['creative', 'Creative'], ['adventure', 'Adventure'], ['spectator', 'Spectator']), always: true },
            { key: 'force-gamemode', label: 'Force the game mode', help: 'Put every player back in the game mode above each time they join.', field: toggle, always: true },
            { key: 'difficulty', label: 'Difficulty', field: options(['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']), always: true },
            { key: 'hardcore', label: 'Hardcore', help: 'Hard difficulty, and players who die can only spectate.', field: toggle, always: true },
            { key: 'pvp', label: 'Player versus player', help: 'Players can hurt one another.', field: toggle, always: true },
            { key: 'allow-flight', label: 'Allow flight', help: 'Do not kick players who fly in survival, as some mods let them.', field: toggle, always: true },
            { key: 'spawn-monsters', label: 'Monsters', field: toggle },
            { key: 'spawn-animals', label: 'Animals', field: toggle },
            { key: 'spawn-npcs', label: 'Villagers', field: toggle },
        ],
    },
    {
        id: 'world',
        title: 'World',
        properties: [
            { key: 'level-name', label: 'World folder', help: 'A new name creates a new world on the next start; the old one stays on disk.', field: { kind: 'text', placeholder: 'world' }, always: true },
            { key: 'level-seed', label: 'Seed', help: 'Only used when a world is created. Empty: a random one.', field: { kind: 'text', placeholder: 'Random' }, always: true },
            {
                key: 'level-type',
                label: 'World type',
                help: 'Only used when a world is created.',
                field: options(
                    ['minecraft:normal', 'Default'],
                    ['minecraft:flat', 'Superflat'],
                    ['minecraft:large_biomes', 'Large biomes'],
                    ['minecraft:amplified', 'Amplified'],
                    ['minecraft:single_biome_surface', 'Single biome']
                ),
                always: true,
            },
            { key: 'generate-structures', label: 'Structures', help: 'Villages, temples, strongholds and the like, in new chunks.', field: toggle, always: true },
            { key: 'allow-nether', label: 'The Nether', field: toggle, always: true },
            { key: 'view-distance', label: 'View distance (chunks)', help: 'How far the server sends the world to players. Each step costs memory and CPU.', field: { kind: 'number', min: 3, max: 32 }, always: true },
            { key: 'simulation-distance', label: 'Simulation distance (chunks)', help: 'How far from players entities move and crops grow.', field: { kind: 'number', min: 3, max: 32 }, always: true },
            { key: 'spawn-protection', label: 'Spawn protection (blocks)', help: 'Around the spawn, only operators can build. 0 turns it off.', field: { kind: 'number', min: 0 }, always: true },
            { key: 'max-world-size', label: 'World border radius (blocks)', field: { kind: 'number', min: 1, max: 29999984 } },
            { key: 'max-build-height', label: 'Build height', field: { kind: 'number', min: 1 } },
        ],
    },
    {
        id: 'players',
        title: 'Players',
        properties: [
            { key: 'white-list', label: 'Whitelist', help: 'Only players on the whitelist can join. Edit it on Players → Access.', field: toggle, always: true },
            { key: 'enforce-whitelist', label: 'Enforce the whitelist', help: 'Kick players who are not on it when the whitelist is reloaded.', field: toggle, always: true },
            { key: 'online-mode', label: 'Online mode', help: 'Check every player\'s account with Mojang. Turn it off only behind a proxy that checks them (BungeeCord, Velocity): anyone could join with any name.', field: toggle, always: true },
            { key: 'enforce-secure-profile', label: 'Signed chat only', help: 'Require players to have a Mojang-signed public key.', field: toggle },
            { key: 'player-idle-timeout', label: 'Kick idle players after (minutes)', help: '0 never kicks them.', field: { kind: 'number', min: 0 }, always: true },
            { key: 'op-permission-level', label: 'Operator level', help: 'The level /op gives.', field: options(['1', '1: bypass spawn protection'], ['2', '2: cheats and command blocks'], ['3', '3: multiplayer management'], ['4', '4: every command']), always: true },
            { key: 'function-permission-level', label: 'Function level', field: options(['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']) },
            { key: 'hide-online-players', label: 'Hide online players', help: 'Leave the list of players out of the server list.', field: toggle },
            { key: 'prevent-proxy-connections', label: 'Refuse proxies and VPNs', field: toggle },
        ],
    },
    {
        id: 'network',
        title: 'Network',
        properties: [
            { key: 'server-port', label: 'Port', help: 'The panel sets it from the server\'s main allocation each time it starts.', field: { kind: 'number' }, always: true, managed: true },
            { key: 'server-ip', label: 'Address', help: 'The panel sets it each time the server starts.', field: { kind: 'text' }, managed: true },
            { key: 'network-compression-threshold', label: 'Compression threshold (bytes)', help: 'Packets above this size are compressed. -1 turns compression off.', field: { kind: 'number', min: -1 } },
            { key: 'rate-limit', label: 'Packets per second per player', help: '0 sets no limit.', field: { kind: 'number', min: 0 } },
            { key: 'max-tick-time', label: 'Watchdog (milliseconds)', help: 'The server stops when a tick takes longer. -1 turns it off.', field: { kind: 'number', min: -1 } },
            { key: 'enable-status', label: 'Answer the server list', field: toggle },
            { key: 'enable-query', label: 'GameSpy query', field: toggle },
            { key: 'query.port', label: 'Query port', field: { kind: 'number', min: 1, max: 65535 }, managed: true },
        ],
    },
    {
        id: 'rcon',
        title: 'RCON',
        properties: [
            { key: 'enable-rcon', label: 'RCON', help: 'A remote console. The Players page reads online players live through it; without it, from their save file.', field: toggle },
            { key: 'rcon.port', label: 'RCON port', help: 'One of the server\'s allocations, for tools outside the node to reach it.',field: { kind: 'number', min: 1, max: 65535 } },
            { key: 'rcon.password', label: 'RCON password', field: { kind: 'secret' } },
            { key: 'broadcast-rcon-to-ops', label: 'Show RCON commands to operators', field: toggle },
            { key: 'broadcast-console-to-ops', label: 'Show console commands to operators', field: toggle },
        ],
    },
    {
        id: 'resource-pack',
        title: 'Resource pack',
        properties: [
            { key: 'resource-pack', label: 'Pack URL', help: 'A direct link to a .zip players download when they join.', field: { kind: 'text', placeholder: 'https://…' }, always: true },
            { key: 'resource-pack-sha1', label: 'SHA-1', help: 'Lets players keep a downloaded copy until the pack changes.', field: { kind: 'text' }, always: true },
            { key: 'require-resource-pack', label: 'Require the pack', help: 'Disconnect players who decline it.', field: toggle, always: true },
            { key: 'resource-pack-prompt', label: 'Prompt', help: 'A text component shown with the download prompt.', field: { kind: 'text' } },
            { key: 'resource-pack-id', label: 'Pack UUID', field: { kind: 'text' } },
        ],
    },
];

export const KNOWN_KEYS = new Set(SECTIONS.flatMap((section) => section.properties.map((property) => property.key)));

/** The value a key takes in a new server.properties, for keys the file does not have yet. */
export const DEFAULTS: Record<string, string> = {
    motd: 'A Minecraft Server',
    'max-players': '20',
    gamemode: 'survival',
    'force-gamemode': 'false',
    difficulty: 'easy',
    hardcore: 'false',
    pvp: 'true',
    'allow-flight': 'false',
    'level-name': 'world',
    'level-seed': '',
    'level-type': 'minecraft:normal',
    'generate-structures': 'true',
    'allow-nether': 'true',
    'view-distance': '10',
    'simulation-distance': '10',
    'spawn-protection': '16',
    'white-list': 'false',
    'enforce-whitelist': 'false',
    'online-mode': 'true',
    'player-idle-timeout': '0',
    'op-permission-level': '4',
    'enable-rcon': 'false',
    'resource-pack': '',
    'resource-pack-sha1': '',
    'require-resource-pack': 'false',
};
