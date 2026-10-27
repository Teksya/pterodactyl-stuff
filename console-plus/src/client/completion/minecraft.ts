import type { Game, Value } from './complete';
import { commands, compareVersions, exists, forVersion, type CommandNode, type Usage, type Version } from './grammar';
import { playerNames, type Player, type PlayerLines } from './scan';

/** minecraft.json, built by scripts/minecraft-data.py. */
export interface MinecraftData {
    commands: CommandNode[];
    registries: Record<string, (string | [name: string, lo: string | 0, hi: string | 0])[]>;
}

export type Flavour = 'bukkit' | 'forge' | 'neoforge' | 'sponge';

const MODES = 'survival|creative|adventure|spectator';
const LEGACY_MODES = `${MODES}|0|1|2|3|s|c|a|sp`;

const legacyRule = (rules: string, value: string, lo?: string): Usage => [`gamerule (${rules}) [value:${value}]`, 'Read or change a game rule', lo];

/** Java Edition's commands before 1.13 rewrote them, as `/help` lists them from 1.8 to 1.12.2. */
const LEGACY: Usage[] = [
    ['achievement (give|take) <achievement:word> [player:players]', 'Give or take an achievement', undefined, '1.12'],
    ['advancement (grant|revoke) <player:players> everything', 'Grant or revoke advancements', '1.12'],
    ['advancement (grant|revoke) <player:players> (only|from|until|through) <advancement:word>', undefined, '1.12'],
    ['advancement test <player:players> <advancement:word> [criterion:word]', undefined, '1.12'],
    ['ban <player:players> [reason:text]', 'Ban a player'],
    ['ban-ip <address:players> [reason:text]', 'Ban an IP address'],
    ['banlist [list:ips|players]', 'List the bans'],
    ['blockdata <position:xyz> <nbt:word>', "Change a block's data"],
    ['clear [player:players] [item:item] [data:number] [maxCount:number] [nbt:word]', "Clear a player's inventory"],
    ['clone <begin:xyz> <end:xyz> <destination:xyz> [mask:replace|masked|filtered] [mode:force|move|normal]', 'Copy blocks'],
    ['debug (start|stop)', 'Profile the server'],
    [`defaultgamemode <mode:${LEGACY_MODES}>`, 'Set the game mode of new players'],
    ['deop <player:players>', "Take a player's operator status"],
    ['difficulty <difficulty:peaceful|easy|normal|hard|0|1|2|3>', 'Set the difficulty'],
    ['effect <player:entities> clear', 'Give or clear status effects'],
    ['effect <player:entities> <effect:effect> [seconds:number] [amplifier:number] [hideParticles:bool]'],
    ['enchant <player:players> <enchantment:enchantment> [level:number]', 'Enchant the held item'],
    ['entitydata <entity:entities> <nbt:word>', "Change an entity's data"],
    ['execute <entity:entities> <position:xyz> ...', 'Run a command as an entity'],
    ['execute <entity:entities> <position:xyz> detect <block:xyz> <block:block> <data:number> ...'],
    ['fill <from:xyz> <to:xyz> <block:block> [data:number] [mode:destroy|hollow|keep|outline|replace] [nbt:word]', 'Fill a region with a block'],
    ['function <name:word> [condition:if|unless] [selector:entities]', 'Run a function', '1.12'],
    [`gamemode <mode:${LEGACY_MODES}> [player:players]`, "Set a player's game mode"],
    legacyRule('commandBlockOutput|doDaylightCycle|doEntityDrops|doFireTick|doMobLoot|doMobSpawning|doTileDrops|keepInventory|logAdminCommands|mobGriefing|naturalRegeneration|reducedDebugInfo|sendCommandFeedback|showDeathMessages', 'true|false'),
    legacyRule('randomTickSpeed', 'number'),
    legacyRule('spectatorsGenerateChunks', 'true|false', '1.8.1'),
    legacyRule('disableElytraMovementCheck', 'true|false', '1.9'),
    legacyRule('spawnRadius', 'number', '1.9'),
    legacyRule('doWeatherCycle', 'true|false', '1.11'),
    legacyRule('maxEntityCramming', 'number', '1.11'),
    legacyRule('announceAdvancements|doLimitedCrafting', 'true|false', '1.12'),
    legacyRule('maxCommandChainLength', 'number', '1.12'),
    legacyRule('gameLoopFunction', 'word', '1.12'),
    ['give <player:players> <item:item> [amount:number] [data:number] [nbt:word]', 'Give an item'],
    ['help [command:command]', 'List the commands'],
    ['kick <player:players> [reason:text]', 'Kick a player'],
    ['kill [target:entities]', 'Kill entities'],
    ['list [uuids]', 'List the players online'],
    ['locate <structure:EndCity|Fortress|Mansion|Mineshaft|Monument|Stronghold|Temple|Village>', 'Find the nearest structure', '1.11'],
    ['me <action:text>', 'Say an action'],
    ['op <player:players>', 'Make a player an operator'],
    ['pardon <player:players>', 'Lift a ban'],
    ['pardon-ip <address:word>', 'Lift an IP ban'],
    ['particle <name:particle> <position:xyz> [delta:xyz] [speed:number] [count:number] [mode:normal|force] [player:players]', 'Show particles'],
    ['playsound <sound:word>', 'Play a sound'],
    ['playsound <sound:word> <player:players> [position:xyz] [volume:number] [pitch:number] [minimumVolume:number]', undefined, undefined, '1.9'],
    ['playsound <sound:word> <source:master|music|record|weather|block|hostile|neutral|player|ambient|voice> <player:players> [position:xyz] [volume:number] [pitch:number] [minimumVolume:number]', undefined, '1.9'],
    ['recipe (give|take) <player:players> <recipe:word>', 'Give or take recipes', '1.12'],
    ['reload', 'Reload the functions and advancements', '1.12'],
    ['replaceitem block <position:xyz> <slot:item_slot> <item:item> [amount:number] [data:number] [nbt:word]', 'Replace an item in an inventory'],
    ['replaceitem entity <target:entities> <slot:item_slot> <item:item> [amount:number] [data:number] [nbt:word]'],
    ['save-all [flush]', 'Save the world'],
    ['save-off', 'Stop saving the world automatically'],
    ['save-on', 'Save the world automatically'],
    ['say <message:text>', 'Send a message to every player'],
    ['scoreboard objectives list', 'Manage objectives, scores and teams'],
    ['scoreboard objectives add <name:word> <criteria:criteria> [displayName:text]'],
    ['scoreboard objectives remove <name:word>'],
    ['scoreboard objectives setdisplay <slot:display> [objective:word]'],
    ['scoreboard players (set|add|remove) <player:entities> <objective:word> <count:number> [nbt:word]'],
    ['scoreboard players reset <player:entities> [objective:word]'],
    ['scoreboard players list [player:entities]'],
    ['scoreboard players enable <player:entities> <trigger:word>'],
    ['scoreboard players test <player:entities> <objective:word> <min:number> [max:number]'],
    ['scoreboard players operation <target:entities> <targetObjective:word> <operation:operation> <selector:entities> <objective:word>'],
    ['scoreboard players tag <player:entities> (add|remove|list) [tag:word]', undefined, '1.9'],
    ['scoreboard teams list [team:word]'],
    ['scoreboard teams add <name:word> [displayName:text]'],
    ['scoreboard teams (remove|empty) <team:word>'],
    ['scoreboard teams join <team:word> [player:entities]'],
    ['scoreboard teams leave [player:entities]'],
    ['scoreboard teams option <team:word> <option:color|friendlyfire|seeFriendlyInvisibles|nametagVisibility|deathMessageVisibility|collisionRule> <value:word>'],
    ['seed', "Show the world's seed"],
    ['setblock <position:xyz> <block:block> [data:number] [mode:destroy|keep|replace] [nbt:word]', 'Place a block'],
    ['setidletimeout <minutes:number>', 'Kick idle players after a time'],
    ['setworldspawn [position:xyz]', "Set the world's spawn"],
    ['spawnpoint [player:players] [position:xyz]', "Set a player's spawn"],
    ['spreadplayers <center:xz> <spreadDistance:number> <maxRange:number> <respectTeams:bool> <player:entities>', 'Spread players over an area'],
    ['stats entity <target:entities> (set|clear) <stat:AffectedBlocks|AffectedEntities|AffectedItems|QueryResult|SuccessCount> [selector:entities] [objective:word]', 'Store command results in scores'],
    ['stats block <position:xyz> (set|clear) <stat:AffectedBlocks|AffectedEntities|AffectedItems|QueryResult|SuccessCount> [selector:entities] [objective:word]'],
    ['stop', 'Stop the server'],
    ['stopsound <player:players> [source:master|music|record|weather|block|hostile|neutral|player|ambient|voice] [sound:word]', 'Stop sounds', '1.9'],
    ['summon <entity:entity> [position:xyz] [nbt:word]', 'Summon an entity'],
    ['teleport <target:entities> <position:xyz> [yRot:number] [xRot:number]', 'Teleport entities', '1.10'],
    ['tell <player:players> <message:text>', 'Send a private message'],
    ['msg <player:players> <message:text>', 'Send a private message'],
    ['w <player:players> <message:text>', 'Send a private message'],
    ['tellraw <player:players> <json:text>', 'Send a JSON message'],
    ['testfor <player:entities> [nbt:word]', 'Count matching entities'],
    ['testforblock <position:xyz> <block:block> [data:number] [nbt:word]', 'Test a block'],
    ['testforblocks <begin:xyz> <end:xyz> <destination:xyz> [mode:all|masked]', 'Compare two regions'],
    ['time set <value:day|night|0|6000|12000|18000>', 'Change or query the time'],
    ['time add <amount:number>'],
    ['time query <what:daytime|gametime|day>'],
    ['title <player:players> (clear|reset)', 'Show a title'],
    ['title <player:players> (title|subtitle) <json:text>'],
    ['title <player:players> actionbar <json:text>', undefined, '1.11'],
    ['title <player:players> times <fadeIn:number> <stay:number> <fadeOut:number>'],
    ['toggledownfall', 'Toggle the rain'],
    ['tp <destination:entities>', 'Teleport entities'],
    ['tp <target:entities> <destination:entities>'],
    ['tp <target:entities> <position:xyz> [yRot:number] [xRot:number]'],
    ['trigger <objective:word> (add|set) <value:number>', 'Change a trigger score'],
    ['weather <type:clear|rain|thunder> [duration:number]', 'Change the weather'],
    ['whitelist (on|off|list|reload)', 'Manage the whitelist'],
    ['whitelist (add|remove) <player:players>'],
    ['worldborder (add|set) <distance:number> [time:number]', 'Manage the world border'],
    ['worldborder center <center:xz>'],
    ['worldborder damage (amount|buffer) <value:number>'],
    ['worldborder get'],
    ['worldborder warning (distance|time) <value:number>'],
    ['xp <amount:word> [player:players]', 'Give experience (10, or 10L for levels)'],
];

/** What the commands of the game's own tree (1.13 and later) do. */
const DESCRIPTIONS: Record<string, string> = {
    advancement: 'Grant or revoke advancements',
    attribute: "Read or change an entity's attributes",
    ban: 'Ban a player',
    'ban-ip': 'Ban an IP address',
    banlist: 'List the bans',
    bossbar: 'Manage boss bars',
    clear: "Clear a player's inventory",
    clone: 'Copy blocks',
    damage: 'Damage entities',
    data: 'Read or change block, entity or storage data',
    datapack: 'Manage the data packs',
    debug: 'Profile the server',
    defaultgamemode: 'Set the game mode of new players',
    deop: "Take a player's operator status",
    dialog: 'Show a dialog',
    difficulty: 'Set the difficulty',
    effect: 'Give or clear status effects',
    enchant: 'Enchant the held item',
    execute: 'Run a command as, at or if',
    experience: 'Give or take experience',
    fetchprofile: "Fetch a player's profile",
    fill: 'Fill a region with a block',
    fillbiome: 'Fill a region with a biome',
    forceload: 'Keep chunks loaded',
    function: 'Run a function',
    gamemode: "Set a player's game mode",
    gamerule: 'Read or change a game rule',
    give: 'Give an item',
    help: 'List the commands',
    item: 'Change items in an inventory',
    jfr: 'Record a Java Flight Recorder profile',
    kick: 'Kick a player',
    kill: 'Kill entities',
    list: 'List the players online',
    locate: 'Find the nearest structure, biome or point of interest',
    locatebiome: 'Find the nearest biome',
    loot: 'Drop or give loot',
    me: 'Say an action',
    msg: 'Send a private message',
    op: 'Make a player an operator',
    pardon: 'Lift a ban',
    'pardon-ip': 'Lift an IP ban',
    particle: 'Show particles',
    perf: 'Record performance for 10 seconds',
    place: 'Place a feature, jigsaw, structure or template',
    playsound: 'Play a sound',
    publish: 'Open the world to the network',
    random: 'Draw a random number',
    recipe: 'Give or take recipes',
    reload: 'Reload the data packs',
    replaceitem: 'Replace an item in an inventory',
    return: "Set a function's result",
    ride: 'Mount or dismount entities',
    rotate: 'Turn an entity',
    'save-all': 'Save the world',
    'save-off': 'Stop saving the world automatically',
    'save-on': 'Save the world automatically',
    say: 'Send a message to every player',
    schedule: 'Run a function later',
    scoreboard: 'Manage objectives and scores',
    seed: "Show the world's seed",
    setblock: 'Place a block',
    setidletimeout: 'Kick idle players after a time',
    setworldspawn: "Set the world's spawn",
    spawnpoint: "Set a player's spawn",
    spectate: 'Spectate an entity',
    spreadplayers: 'Spread players over an area',
    stop: 'Stop the server',
    stopsound: 'Stop sounds',
    stopwatch: 'Manage stopwatches',
    summon: 'Summon an entity',
    swing: "Swing an entity's arm",
    tag: 'Manage entity tags',
    team: 'Manage teams',
    teammsg: 'Send a message to your team',
    teleport: 'Teleport entities',
    tell: 'Send a private message',
    tellraw: 'Send a JSON message',
    test: 'Run game tests',
    tick: 'Freeze, step or speed up the game',
    time: 'Change or query the time',
    title: 'Show a title',
    tm: 'Send a message to your team',
    tp: 'Teleport entities',
    transfer: 'Send players to another server',
    trigger: 'Change a trigger score',
    version: 'The server version',
    w: 'Send a private message',
    waypoint: 'Manage waypoints',
    weather: 'Change the weather',
    whitelist: 'Manage the whitelist',
    worldborder: 'Manage the world border',
    xp: 'Give or take experience',
};

/** Bukkit, Spigot and Paper (and their forks) add these to the game's. */
const BUKKIT: Usage[] = [
    ['plugins', 'List the plugins'],
    ['pl', 'List the plugins'],
    ['version [plugin:word]', 'The server or a plugin version'],
    ['ver [plugin:word]', 'The server or a plugin version'],
    ['reload [confirm]', 'Reload the server (Bukkit)'],
    ['tps', 'Ticks per second'],
    ['timings (on|off|paste|reset|report|verbon|verboff)', 'Timings report (older Paper and Spigot)', undefined, '1.21'],
    ['restart', 'Restart the server (Spigot)'],
    ['spigot reload', 'Reload the Spigot configuration'],
    ['mspt', 'Milliseconds per tick (Paper)', '1.15'],
    ['paper (heap|reload|version|dumpitem|mobcaps|syncloadinfo|dumpplugins|dumplisteners)', 'Paper commands', '1.13'],
    ['paper entity list [type:entity]', undefined, '1.13'],
    ['paper chunkinfo [world:word]', undefined, '1.13'],
    ['paper fixlight [radius:number]', undefined, '1.13'],
    ['paper playermobcaps [player:players]', undefined, '1.13'],
    ['spark (tps|health|ping|gc|gcmonitor|heapsummary|heapdump|tickmonitor|activity)', 'Spark profiler (Paper)', '1.21'],
    ['spark profiler (start|stop|open|cancel|info)', undefined, '1.21'],
];

const FORGE: Usage[] = [
    ['forge tps [dimension:dimension]', 'Forge commands'],
    ['forge track (start|reset|entity|te) [duration:number]'],
    ['forge entity list [filter:word] [dimension:dimension]'],
    ['forge generate <position:xyz> <count:number> [dimension:dimension] [interval:number]', undefined, '1.13'],
    ['forge gen <position:xyz> <count:number> [dimension:number] [interval:number]', undefined, '1.12', '1.13'],
    ['forge (dimensions|mods)', undefined, '1.13'],
    ['forge tags <registry:word>', undefined, '1.18'],
];

const NEOFORGE: Usage[] = [
    ['neoforge tps [dimension:dimension]', 'NeoForge commands'],
    ['neoforge track (start|reset|entity|te) [duration:number]'],
    ['neoforge entity list [filter:word] [dimension:dimension]'],
    ['neoforge generate <position:xyz> <dimension:dimension> <chunkRadius:number>'],
    ['neoforge (dimensions|mods)'],
    ['neoforge tags <registry:word>'],
];

const SPONGE: Usage[] = [
    ['sponge (audit|chunks|heap|plugins|reload|save|tps|version|which|timings|metrics)', 'Sponge commands'],
    ['sponge (config|mods|blockinfo|entityinfo)', undefined, undefined, '1.13'],
];

/** BungeeCord and Waterfall: the proxy's own commands, not the game's. */
const BUNGEE: Usage[] = [
    ['end', 'Stop the proxy'],
    ['greload', 'Reload the configuration'],
    ['alert <message:text>', 'Send a message to every server'],
    ['alertraw <json:text>', 'Send a JSON message to every server'],
    ['send <player:players> <server:word>', 'Move players to a server (all, current or a name)'],
    ['find <player:players>', 'Find the server a player is on'],
    ['glist', 'List the players on each server'],
    ['ip <player:players>', "A player's IP address"],
    ['perms', 'Your permissions'],
    ['bungee', 'The proxy version'],
];

const VELOCITY: Usage[] = [
    ['velocity (version|plugins|reload|dump|heap|info|uptime)', 'Velocity commands'],
    ['shutdown [reason:text]', 'Stop the proxy'],
    ['end', 'Stop the proxy'],
    ['glist [server:word]', 'List the players on each server'],
    ['send <player:players> <server:word>', 'Move players to a server'],
];

/** Bedrock Dedicated Server's console. */
const BEDROCK: Usage[] = [
    ['allowlist (on|off|list|reload)', 'Manage the allowlist'],
    ['allowlist (add|remove) <player:players>'],
    ['changesetting (allow-cheats|difficulty) <value:word>', 'Change a server setting'],
    ['clear [player:players] [item:item] [data:number] [maxCount:number]', "Clear a player's inventory"],
    ['clearspawnpoint [player:players]', "Clear a player's spawn"],
    ['clone <begin:xyz> <end:xyz> <destination:xyz> [mask:replace|masked|filtered] [mode:normal|force|move]', 'Copy blocks'],
    ['damage <target:entities> <amount:number>', 'Damage entities'],
    ['deop <player:players>', "Take a player's operator status"],
    ['difficulty <difficulty:peaceful|easy|normal|hard>', 'Set the difficulty'],
    ['effect <player:entities> clear', 'Give or clear status effects'],
    ['effect <player:entities> <effect:effect> [seconds:number] [amplifier:number] [hideParticles:bool]'],
    ['enchant <player:players> <enchantment:enchantment> [level:number]', 'Enchant the held item'],
    ['execute (as|at) <origin:entities> run ...', 'Run a command as or at entities'],
    ['execute positioned <position:xyz> run ...'],
    ['fill <from:xyz> <to:xyz> <block:block> [mode:destroy|hollow|keep|outline|replace]', 'Fill a region with a block'],
    ['function <name:word>', 'Run a function'],
    ['gamemode <mode:survival|creative|adventure|spectator|default|s|c|a|d> [player:players]', "Set a player's game mode"],
    ['gamerule <rule:commandblockoutput|commandblocksenabled|dodaylightcycle|doentitydrops|dofiretick|doimmediaterespawn|doinsomnia|domobloot|domobspawning|dotiledrops|doweathercycle|drowningdamage|falldamage|firedamage|freezedamage|keepinventory|mobgriefing|naturalregeneration|playerssleepingpercentage|pvp|randomtickspeed|recipesunlock|respawnblocksexplode|sendcommandfeedback|showcoordinates|showdeathmessages|showtags|spawnradius|tntexplodes> [value:word]', 'Read or change a game rule'],
    ['give <player:players> <item:item> [amount:number] [data:number]', 'Give an item'],
    ['help [command:command]', 'List the commands'],
    ['kick <player:players> [reason:text]', 'Kick a player'],
    ['kill [target:entities]', 'Kill entities'],
    ['list', 'List the players online'],
    ['locate (structure|biome) <name:word>', 'Find the nearest structure or biome'],
    ['me <action:text>', 'Say an action'],
    ['msg <player:players> <message:text>', 'Send a private message'],
    ['tell <player:players> <message:text>', 'Send a private message'],
    ['op <player:players>', 'Make a player an operator'],
    ['permission (list|reload)', 'Read the permissions file'],
    ['playsound <sound:word> [player:players] [position:xyz] [volume:number] [pitch:number]', 'Play a sound'],
    ['reload [all]', 'Reload the behaviour packs'],
    ['save (hold|query|resume)', 'Prepare a backup'],
    ['say <message:text>', 'Send a message to every player'],
    ['setblock <position:xyz> <block:block> [mode:destroy|keep|replace]', 'Place a block'],
    ['setmaxplayers <count:number>', 'Set the player limit'],
    ['setworldspawn [position:xyz]', "Set the world's spawn"],
    ['spawnpoint [player:players] [position:xyz]', "Set a player's spawn"],
    ['stop', 'Stop the server'],
    ['structure (save|load|delete) <name:word>', 'Save or load a structure'],
    ['summon <entity:entity> [position:xyz]', 'Summon an entity'],
    ['tag <targets:entities> (add|remove) <name:word>', 'Manage entity tags'],
    ['tag <targets:entities> list'],
    ['teleport <target:entities> <destination:entities>', 'Teleport entities'],
    ['teleport <target:entities> <position:xyz>'],
    ['tp <target:entities> <destination:entities>', 'Teleport entities'],
    ['tp <target:entities> <position:xyz>'],
    ['tellraw <player:players> <json:text>', 'Send a JSON message'],
    ['tickingarea (add|remove|list|preload|remove_all) [name:word]', 'Manage ticking areas'],
    ['time set <value:day|night|noon|midnight|sunrise|sunset>', 'Change or query the time'],
    ['time add <amount:number>'],
    ['time query <what:daytime|gametime|day>'],
    ['title <player:players> (clear|reset)', 'Show a title'],
    ['title <player:players> (title|subtitle|actionbar) <text:text>'],
    ['weather <type:clear|rain|thunder|query> [duration:number]', 'Change the weather'],
    ['xp <amount:word> [player:players]', 'Give experience (10, or 10L for levels)'],
];

const COLORS = ['black', 'dark_blue', 'dark_green', 'dark_aqua', 'dark_red', 'dark_purple', 'gold', 'gray', 'dark_gray', 'blue', 'green', 'aqua', 'red', 'light_purple', 'yellow', 'white', 'reset'];

/** Values of the arguments the game's own command tree types, whatever the edition. */
const FIXED: Record<string, string[]> = {
    bool: ['true', 'false'],
    gamemode: MODES.split('|'),
    dimension: ['overworld', 'the_nether', 'the_end'],
    color: COLORS,
    anchor: ['feet', 'eyes'],
    operation: ['=', '+=', '-=', '*=', '/=', '%=', '<', '>', '><'],
    swizzle: ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'],
    heightmap: ['world_surface', 'motion_blocking', 'motion_blocking_no_leaves', 'ocean_floor'],
    mirror: ['none', 'front_back', 'left_right'],
    turn: ['none', 'clockwise_90', '180', 'counterclockwise_90'],
    display: ['list', 'sidebar', 'below_name', 'belowName', ...COLORS.slice(0, -1).map((color) => `sidebar.team.${color}`)],
    criteria: ['dummy', 'trigger', 'deathCount', 'playerKillCount', 'totalKillCount', 'health', 'xp', 'level', 'food', 'air', 'armor'],
    item_slot: ['weapon.mainhand', 'weapon.offhand', 'armor.head', 'armor.chest', 'armor.legs', 'armor.feet', ...Array.from({ length: 9 }, (_, slot) => `hotbar.${slot}`), 'container.0', 'enderchest.0', 'inventory.0', 'horse.saddle', 'horse.armor'],
};

export interface MinecraftOptions {
    edition: 'java' | 'bedrock' | 'bungee' | 'velocity';
    /** Paper, Forge…: their commands come on top of the game's. A hybrid such as Mohist has two. */
    flavours?: Flavour[];
    version: Version | null;
    /** The players seen in the console, those online first. */
    players: () => Player[];
}

const V113 = [1, 13];

/** Minecraft's console commands for an edition, its flavour (Paper, Forge…) and its version. */
export async function minecraft(options: MinecraftOptions): Promise<Game> {
    const { edition, flavours = [], players } = options;
    // Bedrock's versions are its own; its names are Java's latest.
    const version = edition === 'java' ? options.version : null;
    const legacy = version !== null && compareVersions(version, V113) < 0;
    const data = edition === 'bungee' || edition === 'velocity' ? null : ((await import('./minecraft.json')).default as unknown as MinecraftData);

    const tree: CommandNode[] = [];
    if (edition === 'java') {
        tree.push(...(legacy ? commands(LEGACY) : data!.commands.map((command) => ({ ...command, d: DESCRIPTIONS[command.n] }))));
        const extra = { bukkit: BUKKIT, forge: FORGE, neoforge: NEOFORGE, sponge: SPONGE };
        tree.push(...commands(flavours.flatMap((flavour) => extra[flavour])));
    } else {
        tree.push(...commands({ bedrock: BEDROCK, bungee: BUNGEE, velocity: VELOCITY }[edition]));
    }

    const registries = new Map<string, string[]>();
    const registry = (name: string) => {
        if (!registries.has(name)) {
            const entries = data?.registries[name] ?? [];
            registries.set(name, entries.flatMap((entry) => (typeof entry === 'string' ? [entry] : exists(version, entry[1], entry[2]) ? [entry[0]] : [])));
        }

        return registries.get(name)!;
    };
    const selectors = (all: boolean): Value[] => {
        const list: Value[] = [
            { value: '@a', detail: 'Every player' },
            { value: '@p', detail: 'The nearest player' },
            { value: '@r', detail: 'A random player' },
        ];
        if (all) list.push({ value: '@e', detail: 'Every entity' });
        if (edition === 'bedrock' || version === null || compareVersions(version, [1, 12]) >= 0) list.push({ value: '@s', detail: 'The entity running the command' });
        if (edition === 'java' && (version === null || compareVersions(version, [1, 21]) >= 0) && all) list.push({ value: '@n', detail: 'The nearest entity' });

        return list;
    };
    const proxy = edition === 'bungee' || edition === 'velocity';

    const name = { java: 'Minecraft', bedrock: 'Minecraft: Bedrock', bungee: 'BungeeCord', velocity: 'Velocity' }[edition];

    return {
        name: edition === 'java' && version ? `${name} ${version.join('.')}` : name,
        commands: forVersion(tree, version),
        values: (kind) => {
            if (kind === 'players') {
                const servers = [{ value: 'all', detail: 'Every player' }, { value: 'current', detail: 'The players on your server' }];
                return [...playerNames(players()), ...(proxy ? servers : selectors(false))];
            }
            if (kind === 'entities') return [...playerNames(players()), ...selectors(true)];
            if (kind in FIXED) return FIXED[kind];
            if (['item', 'block', 'entity', 'effect', 'enchantment', 'biome', 'particle'].includes(kind)) return registry(kind);

            return undefined;
        },
    };
}

/** "Starting minecraft server version 1.21.4", or Paper's "(MC: 1.21.4)": the version the server runs. */
export const VERSION_LINE = /Starting minecraft server version (\d+\.\d+(?:\.\d+)?)|\(MC: (\d+\.\d+(?:\.\d+)?)\)/;

/** Players joining, leaving, and the answer to `list`, in Java's, Bedrock's and the proxies' logs. */
export const PLAYER_LINES: PlayerLines = {
    join: [
        /\b([A-Za-z0-9_]{2,16}) joined the game/,
        /UUID of player (?<name>[A-Za-z0-9_]{2,16}) is (?<id>[0-9a-f-]{36})/,
        /Player connected: (?<name>[^,]{1,32}), xuid: (?<id>\d+)/,
        /\[([A-Za-z0-9_]{2,16}),?\s?\/[\d.:]+\] <-> InitialHandler has connected/,
        /\[connected player\] ([A-Za-z0-9_]{2,16}) \(.*\) has connected/,
    ],
    leave: [
        /\b([A-Za-z0-9_]{2,16}) left the game/,
        /Player disconnected: ([^,]{1,32}), xuid/,
        /\[([A-Za-z0-9_]{2,16})\] disconnected with/,
        /\[connected player\] ([A-Za-z0-9_]{2,16}) \(.*\) has disconnected/,
    ],
    list: [/players online:\s*(.*)$/],
};
