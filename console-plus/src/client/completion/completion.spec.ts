import { describe, expect, test } from 'vitest';
import { accept, complete, suggest, tokenize, usage, type Game, type Signature } from './complete';
import { detect, loadGame, type Detected } from './games';
import { commands, exists, parseVersion } from './grammar';
import { minecraft, VERSION_LINE } from './minecraft';
import { seenPlayers, seenValues } from './scan';

const values = (game: Game, line: string) => complete(game, line).items.map((item) => item.value);
/** A usage as text, the argument being typed in stars: `give <targets> *<item>* [count]`. */
const read = (signature: Signature | null) => signature?.parts.map((part) => (part.role === 'current' ? `*${part.text}*` : part.text)).join(' ');

const CONSOLE = [
    '[12:00:00] [Server thread/INFO]: Starting minecraft server version 1.21.4',
    '[12:00:05] [Server thread/INFO]: Steve joined the game',
    '[12:00:06] [Server thread/INFO]: Alex joined the game',
    '[12:00:09] [Server thread/INFO]: Alex left the game',
];

const java = (version: string | null, flavours: ('bukkit' | 'forge' | 'neoforge' | 'sponge')[] = []) =>
    minecraft({ edition: 'java', flavours, version: parseVersion(version), players: () => seenPlayers(CONSOLE, { join: [/(\w+) joined the game/], leave: [/(\w+) left the game/] }) });

const load = (detected: Detected, texts: string[] = []) => loadGame(detected, null, () => texts);

describe('grammar', () => {
    test('reads versions as the eggs write them', () => {
        expect(parseVersion('1.21.4')).toEqual([1, 21, 4]);
        expect(parseVersion('1.12.2-7.3.0')).toEqual([1, 12, 2]);
        expect(parseVersion('1.20.1-47.2.0')).toEqual([1, 20, 1]);
        expect(parseVersion('26.1')).toEqual([26, 1]);
        expect(parseVersion('latest')).toBeNull();
        expect(parseVersion('25w44a')).toBeNull();
        expect(exists([1, 16, 5], '1.13', '1.17')).toBe(true);
        expect(exists([1, 17], '1.13', '1.17')).toBe(false);
        expect(exists([26, 1], '1.21.11')).toBe(true);
        expect(exists(null, '1.13', '1.17')).toBe(false);
    });

    test('builds a tree from usage lines', () => {
        const tree = commands([
            ['kick <player:player> [reason:text]', 'Kick a player'],
            'weather.(rain|fog) [value:number]',
            ['old', undefined, undefined, '1.12'],
            'run <who:entities> ...',
        ]);
        expect(tree.map((node) => node.n)).toEqual(['kick', 'weather.rain', 'weather.fog', 'old', 'run']);
        expect(tree[0]).toMatchObject({ d: 'Kick a player', c: [{ n: 'player', t: 'player', x: 1, c: [{ n: 'reason', t: 'text', x: 1 }] }] });
        expect(tree[3].hi).toBe('1.12');
        expect(tree[4].c![0].r).toBe('');
    });

    test('keeps quoted strings, selectors and NBT in one word', () => {
        expect(tokenize('summon zombie ~ ~ ~ {CustomName:"\\"Bob the zombie\\""}').map((token) => token.text)).toEqual(['summon', 'zombie', '~', '~', '~', '{CustomName:"\\"Bob the zombie\\""}']);
        expect(tokenize('kill @e[type=cow, limit=1]').map((token) => token.text)).toEqual(['kill', '@e[type=cow, limit=1]']);
    });
});

describe('Minecraft', () => {
    test('completes the latest commands, their words and their values', async () => {
        const game = await java(null);
        expect(game.name).toBe('Minecraft');
        expect(values(game, 'gamem')).toEqual(['gamemode']);
        expect(values(game, 'gamemode ')).toEqual(['survival', 'creative', 'adventure', 'spectator']);
        // Players the console saw, online first, then the selectors.
        expect(values(game, 'gamemode creative ')).toEqual(['Steve', 'Alex', '@a', '@p', '@r', '@s']);
        expect(values(game, 'give Steve diamond_sw')).toEqual(['diamond_sword']);
        expect(values(game, 'give Steve netherite_s')).toEqual(['netherite_scrap', 'netherite_shovel', 'netherite_spear', 'netherite_sword']);
        expect(values(game, 'give Steve sword')).toContain('diamond_sword');
        expect(values(game, 'give Steve minecraft:diamond_sw')).toEqual(['diamond_sword']);
        expect(values(game, 'effect give @a night')).toEqual(['night_vision']);
        expect(values(game, 'kill @')).toContain('@n');
        // execute … run goes back to every command; aliases follow their command.
        expect(values(game, 'execute as @a at @s run gi')).toEqual(['give']);
        expect(values(game, 'tell Steve ')).toEqual([]);
        expect(read(complete(game, 'tell Steve ').signature)).toBe('tell <targets> *<message>*');
        expect(read(complete(game, 'give Steve ').signature)).toBe('give <targets> *<item>* [count]');
        expect(complete(game, 'give Steve ').signature?.description).toBe('Give an item');
        expect(read(usage(complete(game, 'giv').items[0].node!))).toBe('*give* <targets> <item> [count]');
        // The players with whether they are online, the selectors with what they pick.
        expect(complete(game, 'kill ').items.slice(0, 3).map((item) => [item.value, item.detail])).toEqual([
            ['Steve', 'online'],
            ['Alex', 'left'],
            ['@a', 'Every player'],
        ]);
        // A command typed whole that needs more goes on to what follows.
        const whole = complete(game, 'gamemode');
        expect(whole.items.map((item) => item.insert)).toEqual(['gamemode survival', 'gamemode creative', 'gamemode adventure', 'gamemode spectator']);
        expect(accept('gamemode', whole, whole.items[1])).toEqual({ line: 'gamemode creative ', cursor: 18 });
        expect(values(game, 'list')).toEqual(['list']);
        expect(values(game, '/weather ')).toEqual(['clear', 'rain', 'thunder']);
        expect(values(game, 'gamerule keep')).toEqual(['keep_inventory']);
        expect(complete(game, 'tp ').items[0]).toMatchObject({ value: 'Steve' });
        expect(values(game, 'setblock ')).toEqual(['~ ~ ~']);
    });

    test('follows the version: commands, game rules, names, selectors', async () => {
        const modern = await java('1.20.1');
        expect(values(modern, 'gamerule keep')).toEqual(['keepInventory']);
        expect(values(modern, 'ite')).toEqual(['item']);
        expect(values(modern, 'replacei')).toEqual([]);
        expect(values(modern, 'kill @')).not.toContain('@n');
        expect(values(modern, 'tic')).toEqual([]);
        expect(values(await java('1.20.3'), 'tic')).toEqual(['tick']);

        const before = await java('1.16.5');
        expect(values(before, 'replacei')).toEqual(['replaceitem']);
        expect(values(before, 'ite')).toEqual([]);
        expect(values(before, 'give @p netherite_s')).toEqual(['netherite_scrap', 'netherite_shovel', 'netherite_sword']);
        expect(values(await java('1.15.2'), 'give @p netherite_s')).toEqual([]);

        const legacy = await java('1.12.2');
        expect(legacy.name).toBe('Minecraft 1.12.2');
        expect(values(legacy, 'gamemode ')).toEqual(['survival', 'creative', 'adventure', 'spectator', '0', '1', '2', '3', 's', 'c', 'a', 'sp']);
        expect(values(legacy, 'advancement ')).toEqual(['grant', 'revoke', 'test']);
        expect(values(legacy, 'achiev')).toEqual([]);
        expect(values(legacy, 'testfor')).toEqual(['testfor', 'testforblock', 'testforblocks']);
        expect(values(legacy, 'execute @a ~ ~ ~ gi')).toEqual(['give']);
        expect(values(legacy, 'gamerule keep')).toEqual(['keepInventory']);

        const old = await java('1.8.9');
        expect(values(old, 'achiev')).toEqual(['achievement']);
        expect(values(old, 'stopso')).toEqual([]);
        expect(values(old, 'summon Creep')).toEqual(['Creeper']);
        expect(values(old, 'kill @')).toEqual(['@a', '@p', '@r', '@e']);
        expect(values(await java('1.12'), 'summon creep')).toEqual(['creeper']);
    });

    test("adds Paper's, Forge's and Sponge's commands", async () => {
        expect(values(await java('1.21.4', ['bukkit']), 'pl')).toEqual(['pl', 'place', 'playsound', 'plugins']);
        expect(values(await java('1.21.4', ['bukkit']), 'spark ')).toContain('tps');
        expect(values(await java('1.20.1', ['forge']), 'forge ')).toEqual(['tps', 'track', 'entity', 'generate', 'dimensions', 'mods', 'tags']);
        expect(values(await java('1.12.2', ['sponge']), 'sponge ')).toContain('mods');
        expect(values(await java('1.12.2'), 'forge')).toEqual([]);
    });

    test("completes the proxies' and Bedrock's own commands", async () => {
        const bungee = await minecraft({ edition: 'bungee', version: null, players: () => [{ name: 'Steve', online: true }] });
        expect(values(bungee, 'al')).toEqual(['alert', 'alertraw']);
        expect(values(bungee, 'send ')).toEqual(['Steve', 'all', 'current']);
        expect(values(bungee, 'gamem')).toEqual([]);
        const bedrock = await minecraft({ edition: 'bedrock', version: null, players: () => [] });
        expect(values(bedrock, 'allowlist ')).toEqual(['on', 'off', 'list', 'reload', 'add', 'remove']);
        expect(values(bedrock, 'give @s apple')).toContain('apple');
    });

    test('reads the version and the players from the console', () => {
        expect(VERSION_LINE.exec(CONSOLE[0])?.[1]).toBe('1.21.4');
        expect(VERSION_LINE.exec('This server is running Paper version 1.21.4-232-main@abc (2025-01-01) (Implementing API version 1.21.4-R0.1-SNAPSHOT) (MC: 1.21.4)')?.[2]).toBe('1.21.4');
        expect(seenPlayers([...CONSOLE, 'There are 2 of a max of 20 players online: Steve, Notch'], { join: [/(\w+) joined the game/], list: [/players online:\s*(.*)$/] })).toEqual([
            { name: 'Steve', online: true },
            { name: 'Notch', online: true },
            { name: 'Alex', online: false },
        ]);
    });
});

describe('other games', () => {
    test('Source: maps, players in quotes, any case', async () => {
        const console = ['L 01/01/2026 - 12:00:00: "John Doe<2><STEAM_1:0:1><>" connected, address "1.2.3.4:27005"', 'Started map "de_cache"'];
        const cs = await load({ game: 'source', kind: 'csgo', map: 'de_dust2' }, console);
        expect(cs.name).toBe('Counter-Strike: Global Offensive');
        expect(values(cs, 'STA')).toEqual(['stats', 'status']);
        expect(values(cs, 'changelevel de_')).toEqual(expect.arrayContaining(['de_cache', 'de_dust2', 'de_mirage']));
        expect(values(cs, 'changelevel de_')[0]).toBe('de_cache');
        expect(values(cs, 'kick ')).toEqual(['"John Doe"']);
        expect(complete(cs, 'kickid ').items.map((item) => [item.value, item.detail])).toEqual([['STEAM_1:0:1', 'John Doe (online)']]);
        expect(complete(cs, 'changelevel de_c').items[0]).toMatchObject({ value: 'de_cache', detail: 'Current map' });
        expect(read(complete(cs, 'banid 0 ').signature)).toBe('banid <minutes> *<SteamID>* [kick]');
        expect(values(cs, 'bot_add ')).toEqual(['ct', 't']);
        expect(values(cs, 'sm plugins ')).toContain('reload');

        const gmod = await load({ game: 'source', kind: 'gmod', map: null });
        expect(values(gmod, 'lua_')).toEqual(['lua_openscript', 'lua_run']);
        expect(values(gmod, 'changelevel ')).toEqual(['gm_flatgrass', 'gm_construct']);
        const tf2 = await load({ game: 'source', kind: 'tf2', map: null });
        expect(values(tf2, 'tf_bot_add 2 ')).toContain('medic');
        expect(values(await load({ game: 'source', kind: 'other', map: null }), 'tf_bot')).toEqual([]);
    });

    test('ARK, Rust, Terraria and FiveM', async () => {
        const ark = await load({ game: 'ark' }, ['0. Notch, 76561198000000011', '1. jeb_, 76561198000000022', 'Dinnerbone joined this ARK!', '2. Dinnerbone, 76561198000000033', 'jeb_ left this ARK!']);
        expect(values(ark, 'listp')).toEqual(['ListPlayers']);
        // As the panel shows it: `kickplayer` typed whole, the Steam ids with their players, the usage.
        const kick = complete(ark, 'kickplayer');
        expect(kick.items.map((item) => [item.value, item.detail])).toEqual([
            ['76561198000000033', 'Dinnerbone (online)'],
            ['76561198000000011', 'Notch (online)'],
            ['76561198000000022', 'jeb_ (left)'],
        ]);
        expect(read(kick.signature)).toBe('KickPlayer *<SteamID>*');
        expect(kick.signature?.description).toBe('Disconnect a player. They can join again.');
        expect(accept('kickplayer', kick, kick.items[1]).line).toBe('KickPlayer 76561198000000011');
        expect(values(ark, 'ServerChatToPlayer ')).toEqual(['Dinnerbone', 'Notch', 'jeb_']);

        const rust = await load({ game: 'rust', framework: 'oxide' }, ['1.2.3.4:5678/76561198000000000/Bob joined [windows/76561198000000000]']);
        expect(values(rust, 'oxide.re')).toEqual(['oxide.reload', 'oxide.revoke']);
        expect(values(rust, 'c.')).toEqual([]);
        expect(values(rust, 'inventory.giveto Bob rifle.a')).toEqual(['rifle.ak']);
        expect(values(rust, 'kick ')).toEqual(['Bob']);
        expect(values(rust, 'weather.load ')).toEqual(['Clear', 'Dust', 'Fog', 'Overcast', 'Rain', 'Storm']);
        expect(values(await load({ game: 'rust', framework: 'vanilla' }), 'oxide')).toEqual([]);
        expect(values(await load({ game: 'rust', framework: null }), 'c.pl')).toEqual(['c.plugins']);

        const terraria = await load({ game: 'terraria', tshock: false }, ['Re-Logic has joined.']);
        expect(values(terraria, 'kick ')).toEqual(['Re-Logic']);
        expect(values(terraria, 'du')).toEqual(['dusk']);
        expect(values(terraria, 'user')).toEqual([]);
        expect(values(await load({ game: 'terraria', tshock: true }), '/user ')).toEqual(['add', 'del', 'password', 'group']);

        const fivem = await load({ game: 'fivem' }, ['Started resource chat', 'Started resource spawnmanager']);
        expect(values(fivem, 'ensure ')).toEqual(['spawnmanager', 'chat']);
    });

    test("picks the game from each default egg's name, tags and variables", () => {
        expect(detect({ egg: 'Vanilla Minecraft', tags: ['minecraft'], variables: { VANILLA_VERSION: 'latest' } })).toEqual({ game: 'minecraft', edition: 'java', flavours: [], version: null });
        expect(detect({ egg: 'Paper', tags: ['minecraft'], variables: { MINECRAFT_VERSION: '1.21.4' } })).toEqual({ game: 'minecraft', edition: 'java', flavours: ['bukkit'], version: '1.21.4' });
        expect(detect({ egg: 'Forge Minecraft', tags: ['minecraft'], variables: { MC_VERSION: '1.20.1', FORGE_VERSION: '47.2.0' } })).toMatchObject({ flavours: ['forge'], version: '1.20.1' });
        expect(detect({ egg: 'Sponge (SpongeVanilla)', tags: ['minecraft'], variables: { SPONGE_VERSION: '1.12.2-7.3.0' } })).toMatchObject({ flavours: ['sponge'], version: '1.12.2-7.3.0' });
        expect(detect({ egg: 'Bungeecord', tags: ['minecraft'] })).toMatchObject({ edition: 'bungee' });
        expect(detect({ egg: 'Vanilla Bedrock', tags: ['minecraft', 'bedrock'] })).toMatchObject({ edition: 'bedrock' });
        expect(detect({ egg: 'Garrys Mod', tags: ['srcds', 'garrysmod'] })).toMatchObject({ game: 'source', kind: 'gmod' });
        expect(detect({ egg: 'Counter-Strike: Global Offensive', tags: ['srcds'], variables: { SRCDS_APPID: '740' } })).toMatchObject({ kind: 'csgo' });
        expect(detect({ egg: 'Counter-Strike: Global Offensive', tags: ['srcds'], variables: { SRCDS_APPID: '730' } })).toMatchObject({ kind: 'cs2' });
        expect(detect({ egg: 'Team Fortress 2', tags: ['srcds'] })).toMatchObject({ kind: 'tf2' });
        expect(detect({ egg: 'Insurgency', tags: ['srcds'] })).toMatchObject({ kind: 'insurgency' });
        expect(detect({ egg: 'Custom Source Engine Game', tags: ['srcds'], variables: { SRCDS_GAME: 'tf' } })).toMatchObject({ kind: 'tf2' });
        expect(detect({ egg: 'Custom Source Engine Game', tags: ['srcds'], variables: { SRCDS_GAME: 'cstrike', SRCDS_MAP: 'de_dust2' } })).toEqual({ game: 'source', kind: 'other', map: 'de_dust2' });
        // Without the extension's API, the tags and the startup command.
        expect(detect({ tags: ['srcds'], invocation: './srcds_run -game garrysmod -console' })).toMatchObject({ kind: 'gmod' });
        expect(detect({ egg: 'Ark: Survival Evolved', tags: ['srcds'] })).toEqual({ game: 'ark' });
        expect(detect({ egg: 'Rust', tags: ['rust'], variables: { FRAMEWORK: 'oxide' } })).toEqual({ game: 'rust', framework: 'oxide' });
        expect(detect({ egg: 'tShock', tags: [] })).toEqual({ game: 'terraria', tshock: true });
        expect(detect({ egg: 'FiveM', tags: ['fivem'] })).toEqual({ game: 'fivem' });
        // Voice servers read no commands.
        expect(detect({ egg: 'Mumble Server', tags: ['voice'] })).toBeNull();
        expect(detect({ egg: 'Teamspeak3 Server', tags: ['voice'] })).toBeNull();
        expect(detect({})).toBeNull();
    });
});

describe('suggestions', () => {
    test('puts the commands sent before first, and accepts a suggestion in place of the word', async () => {
        const game = await java(null);
        const line = 'gamemode cr';
        const completion = suggest(game, line, ['gamemode creative Steve', 'say hi'])!;
        expect(completion.items.map((item) => [item.kind, item.value])).toEqual([
            ['history', 'gamemode creative Steve'],
            ['value', 'creative'],
        ]);
        expect(accept(line, completion, completion.items[1])).toEqual({ line: 'gamemode creative ', cursor: 18 });
        expect(accept(line, completion, completion.items[0])).toEqual({ line: 'gamemode creative Steve', cursor: 23 });
        // A word in the middle of the line: only that word changes.
        const middle = complete(game, 'gamemode cr Steve', 11);
        expect(accept('gamemode cr Steve', middle, middle.items[0]).line).toBe('gamemode creative Steve');
        // Without a game, the history alone; nothing at all: no suggestions.
        expect(suggest(null, 'sa', ['say hi'])!.items.map((item) => item.value)).toEqual(['say hi']);
        expect(suggest(null, 'sa', [])).toBeNull();
        expect(seenValues(['a 1', 'b 2', 'a 1'], [/(\d)/])).toEqual(['1', '2']);
    });
});
