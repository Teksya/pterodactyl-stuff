<?php

/*
 * Tests of what actions do, against a server played by stand-ins for the panel's classes: files in
 * memory, a console that records the commands typed in it, RCON that answers questions, and a
 * power state.
 *
 *     php tests/actions.php
 */

declare(strict_types=1);


require __DIR__.'/stubs.php';

use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Nbt\Tag;
use OlivierDutoit\Minecraft\Players\Actions;
use OlivierDutoit\Minecraft\Players\Lists;
use OlivierDutoit\Minecraft\Players\PlayerFile;
use OlivierDutoit\Minecraft\Players\Players;
use OlivierDutoit\Minecraft\Players\World;
use OlivierDutoit\Minecraft\Players\WorldLive;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\Properties;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Models\Server;

$steve = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
$alex = '11111111-1111-4111-8111-111111111111';
$withRcon = "level-name=world\nonline-mode=true\nop-permission-level=3\nenable-rcon=true\nrcon.port=25575\nrcon.password=secret\n";
$withoutRcon = "level-name=world\nonline-mode=true\nop-permission-level=3\n";

$fake = new FakeServer();
rconOf($fake);
$fake->files = [
    'server.properties' => $withoutRcon,
    'usercache.json' => json_encode([['name' => 'Steve', 'uuid' => $steve], ['name' => 'Alex', 'uuid' => $alex]]),
    'ops.json' => json_encode([['uuid' => $alex, 'name' => 'Alex', 'level' => 2, 'bypassesPlayerLimit' => true]]),
    'world/level.dat' => Nbt::write(Tag::compound(['Data' => Tag::compound(['DataVersion' => Tag::int(4325), 'Version' => Tag::compound(['Name' => Tag::string('1.21.5')])])])),
    "world/playerdata/{$steve}.dat" => Nbt::write(Tag::compound(['DataVersion' => Tag::int(4325), 'playerGameType' => Tag::int(0), 'Inventory' => Tag::list(Tag::COMPOUND)])),
];

$server = new Server();
$files = new MinecraftServer($fake, $fake, $fake);
// Each request builds its own, as the panel does: server.properties and who is online are read once
// per request.
$request = function () use ($fake): array {
    $files = new MinecraftServer($fake, $fake, $fake);
    $console = new ServerConsole($fake, new State($fake));
    $lists = new Lists($files);
    $players = new Players($files, $console, $lists, new ServerRcon($files));

    return [$players, new Actions($players, $lists, $files, $console)];
};
$players = fn (): Players => $request()[0];
$actions = fn (): Actions => $request()[1];

// Stopped: everyone is offline, and actions change the files.
$all = $players()->all($server);
check('players known', array_map(fn (array $player): array => [$player['name'], $player['online'], $player['op']], $all), [['Steve', false, null], ['Alex', false, 2]]);
$actions()->player($server, $steve, 'gamemode', ['mode' => 'creative']);
$actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 3]);
$file = PlayerFile::load($fake->files["world/playerdata/{$steve}.dat"]);
check('offline edits the file', [$file->root->get('playerGameType')->value, $file->item('inventory.0')->get('id')->value], [1, 'minecraft:diamond']);
$actions()->player($server, $steve, 'op', []);
$actions()->player($server, $alex, 'op', []);
check('offline op uses the server level and keeps an existing one', array_column(json_decode($fake->files['ops.json'], true), 'level', 'name'), ['Alex' => 2, 'Steve' => 3]);
check('nothing went to the console, nothing asked over RCON', [$fake->sent, $fake->asked], [[], []]);
throws('messages need the player', fn () => $actions()->player($server, $steve, 'message', ['text' => 'hi']), 'offline');
$page = $players()->profile($server, $steve);
check('stopped: the file is the truth', [$page['source'], $page['saved'], $page['gamemode'], $page['rcon']['state']], ['file', true, 'creative', 'idle']);

// A list that cannot be read is never overwritten.
$fake->files['banned-players.json'] = '[{"uuid": "x",]';
throws('broken list', fn () => $actions()->player($server, $steve, 'ban', []), 'not a valid JSON list');
check('broken list kept', $fake->files['banned-players.json'], '[{"uuid": "x",]');

// Starting: no file is touched, and nobody's state is known.
$fake->state = 'starting';
throws('starting refuses list files', fn () => $actions()->player($server, $steve, 'whitelist_add', []), 'starting');
throws('starting refuses player files', fn () => $actions()->player($server, $steve, 'heal', []), 'starting');
check('starting: who is online is unknown', array_column($players()->all($server), 'online', 'name'), ['Steve' => null, 'Alex' => null]);
$page = $players()->profile($server, $steve);
check('starting: a player shows their last save', [$page['source'], $page['online'], $page['saved'], $page['gamemode']], ['file', null, true, 'creative']);

// Running without RCON: the panel does not know who is online, does not guess, and still sends
// commands, which need no answer.
$fake->state = 'running';
$fake->online = ['Steve'];
$presence = $players()->presence($server);
check('without RCON nobody is known online', [$presence['known'], $presence['online'], $presence['rcon']['state'], array_column($players()->all($server), 'online', 'name')], [false, null, 'off', ['Steve' => null, 'Alex' => null]]);
$page = $players()->profile($server, $steve);
check('without RCON a player shows their last save', [$page['source'], $page['online'], $page['saved'], $page['gamemode'], $page['rcon']['state'], $fake->asked], ['file', null, true, 'creative', 'off', []]);
$result = $actions()->player($server, $steve, 'heal', []);
check('without RCON actions are commands', [$result['command'], end($fake->sent), $fake->asked], ['effect give Steve minecraft:instant_health 1 10 true', 'effect give Steve minecraft:instant_health 1 10 true', []]);
$actions()->player($server, $alex, 'whitelist_add', []);
check('lists go through the console while running', end($fake->sent), 'whitelist add Alex');
throws('without RCON a slot cannot be checked', fn () => $actions()->player($server, $steve, 'move', ['from' => 'inventory.0', 'to' => 'inventory.5']), 'needs RCON');

// Running with RCON: `list uuids` says who is online, an online player is read live, actions stay
// commands in the console.
$fake->files['server.properties'] = $withRcon;
$fake->live['Steve'] = [
    'Health' => '14.5f',
    'foodLevel' => '17',
    'Pos' => '[12.5d, 64.0d, -3.25d]',
    'Dimension' => '"minecraft:the_nether"',
    'playerGameType' => '1',
    'Inventory' => '[{Slot: 0b, id: "minecraft:diamond_sword", count: 1, components: {"minecraft:enchantments": {"minecraft:sharpness": 5}}}, {Slot: 9b, id: "minecraft:stone", count: 64}]',
    'equipment' => '{head: {id: "minecraft:iron_helmet", count: 1}}',
];
$all = $players()->all($server);
check('online from RCON', array_column($all, 'online', 'name'), ['Steve' => true, 'Alex' => false]);
check('who is online is asked over RCON, by both names of the vanilla `list`', $fake->asked, ['minecraft:list uuids', 'list uuids']);
// Paper with a plugin that took `list` and answers in its own words: the vanilla command keeps the
// name `minecraft:list`.
$fake->bukkit = true;
$fake->plugin = ['list' => '$<p:prefix> Il y a <p:primary-color>[1/20]</p> joueurs en ligne.'];
$presence = $players()->presence($server);
check('a plugin taking `list` changes nothing', [$presence['rcon']['state'], $presence['online'], $presence['players']], ['ok', 1, [$steve => 'Steve']]);
// A `list` that names players alone (the Bukkit form), on a server without `minecraft:` names:
// matched by name.
$fake->bukkit = false;
$fake->plugin = ['list' => 'There are 1/20 players online:Steve'];
check('names alone, matched by name', array_column($players()->all($server), 'online', 'name'), ['Steve' => true, 'Alex' => false]);
// `list` names someone the panel cannot read: the others are not taken for offline, and an action
// on one goes to the console rather than to a file the server may hold.
$fake->plugin = ['list' => "There are 2 of a max of 20 players online: Steve ({$steve}), ???"];
check('a list read in part', array_column($players()->all($server), 'online', 'name'), ['Steve' => true, 'Alex' => null]);
$sent = count($fake->sent);
$result = $actions()->player($server, $alex, 'feed', []);
check('an action on a player not known to be offline', [count($fake->sent) - $sent, $result['message']], [1, 'Sent to the console. Whether Alex is online is unknown here: the command acts only if they are.']);
// No vanilla `list` under either name: RCON is on, and the page says what the server answered.
$fake->plugin = ['list' => '$<p:prefix> Il y a <p:primary-color>[1/20]</p> joueurs en ligne.'];
$presence = $players()->presence($server);
check('no vanilla `list`', [$presence['known'], $presence['rcon']], [false, ['state' => 'error', 'error' => 'The server answered: $<p:prefix> Il y a <p:primary-color>[1/20]</p> joueurs en ligne.']]);
$fake->plugin = [];
$fake->connections = 0;
$live = $players()->profile($server, $steve);
check('a request asks all its questions on one connection', $fake->connections, 1);
check('an online player is read live', [$live['source'], $live['health'], $live['food'], $live['dimension'], $live['gamemode'], array_column($live['inventory'], 'id', 'slot'), $live['armor']['head']['id'] ?? null, $live['inventory'][0]['enchantments']], [
    'live', 14.5, 17, 'minecraft:the_nether', 'creative', ['inventory.0' => 'minecraft:diamond_sword', 'inventory.9' => 'minecraft:stone'], 'minecraft:iron_helmet', [['id' => 'minecraft:sharpness', 'level' => 5]],
]);
// Fields the player does not have ("Found no elements…") are simply empty.
check('every field the server gave is read', $live['unread'], []);
// An answer the panel cannot read is said, rather than shown as an empty value.
$fake->live['Steve']['Pos'] = '[12.5d, 64.0d';
$broken = $players()->profile($server, $steve);
check('a field the panel cannot read is said', [$broken['source'], array_column($broken['unread'], 'field'), str_contains($broken['unread'][0]['reason'] ?? '', 'near "'), $broken['position']], ['live', ['Pos'], true, null]);
$fake->live['Steve']['Pos'] = '[12.5d, 64.0d, -3.25d]';

// A server that cuts answers longer than 80 characters short, as a plugin does: items and what is
// worn are asked one by one, and an item still too long value by value. Only a value too long on
// its own (this name) is missing, and said.
$fake->cut = 80;
$fake->live['Steve']['Inventory'] = substr($fake->live['Steve']['Inventory'], 0, -1).', {Slot: 2b, id: "minecraft:stick", count: 1, components: {"minecraft:custom_name": "A stick with a name longer than the server answers"}}]';
$fake->asked = [];
$parts = $players()->profile($server, $steve);
check('a server cutting answers short is read in parts', [
    array_column($parts['inventory'], 'id', 'slot'), $parts['inventory'][0]['enchantments'], $parts['armor']['head']['id'] ?? null, $parts['health'], $parts['unread'],
], [
    ['inventory.0' => 'minecraft:diamond_sword', 'inventory.9' => 'minecraft:stone', 'inventory.2' => 'minecraft:stick'], [['id' => 'minecraft:sharpness', 'level' => 5]], 'minecraft:iron_helmet', 14.5,
    [['field' => 'Inventory[2].components."minecraft:custom_name"', 'reason' => 'The server cut its answer short.']],
]);
check('only what was cut is asked again', [
    in_array('data get entity Steve Inventory[0].components."minecraft:enchantments"', $fake->asked, true),
    in_array('data get entity Steve Inventory[1].id', $fake->asked, true),
    in_array('data get entity Steve equipment.head', $fake->asked, true),
    in_array('data get entity Steve Health', array_slice($fake->asked, 3), true),
    // A list has no gaps: the first item missing ends it.
    in_array('data get entity Steve Inventory[3]', $fake->asked, true),
    in_array('data get entity Steve Inventory[4]', $fake->asked, true),
], [true, false, true, false, true, false]);
// Whether a slot holds an item does not depend on how long the answer is.
throws('a slot cut short is still full', fn () => $actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 1, 'slot' => 'inventory.0']), 'holds an item');
$fake->cut = 0;
$fake->live['Steve']['Inventory'] = '[{Slot: 0b, id: "minecraft:diamond_sword", count: 1, components: {"minecraft:enchantments": {"minecraft:sharpness": 5}}}, {Slot: 9b, id: "minecraft:stone", count: 64}]';

// On a server that keeps the vanilla commands as `minecraft:<name>` (it answered `minecraft:list`),
// a plugin taking `data` changes nothing either.
$fake->bukkit = true;
$fake->plugin = ['data' => 'Usage: /data <get|set>'];
$fake->asked = [];
check('`data` by its vanilla name', [$players()->profile($server, $steve)['health'], in_array('minecraft:data get entity Steve Health', $fake->asked, true)], [14.5, true]);
$fake->bukkit = false;
$fake->plugin = [];
$fake->asked = [];
$result = $actions()->player($server, $steve, 'heal', []);
check('with RCON actions are still commands', [$result['message'], end($fake->sent), $fake->asked], ['Sent to the console.', 'effect give Steve minecraft:instant_health 1 10 true', ['minecraft:list uuids', 'list uuids']]);
throws('online move into a full slot', fn () => $actions()->player($server, $steve, 'move', ['from' => 'inventory.1', 'to' => 'inventory.0']), 'holds an item');
$result = $actions()->player($server, $steve, 'move', ['from' => 'inventory.0', 'to' => 'inventory.5']);
check('online move into an empty slot', $result['command'], 'item replace entity Steve hotbar.5 from entity Steve hotbar.0 · execute if items entity Steve hotbar.5 * run item replace entity Steve hotbar.0 with minecraft:air');
$result = $actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'inventory.6']);
check('online give into an empty slot', $result['command'], 'execute unless items entity Steve hotbar.6 * run item replace entity Steve hotbar.6 with minecraft:diamond 2');
throws('online give into a full slot', fn () => $actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'inventory.9']), 'holds an item');
// A slot answer that is not about that slot (another request's, on a server that shares one RCON
// buffer) is no empty slot.
$fake->plugin = ['data' => 'Found no elements matching active_effects'];
throws('an answer about another path', fn () => $actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'inventory.6']), 'could not tell whether that slot is empty');
$fake->plugin = [];

// Paper with a plugin that took `item` and `give` (EssentialsX's `/item` refuses the console): the
// actions are typed by the vanilla names the server keeps, which `list` found.
$fake->bukkit = true;
$fake->plugin = ['item' => 'Only in-game players can use item.', 'give' => 'Usage: /give <player> <item>', 'execute' => 'Unknown'];
$fake->sent = [];
$fake->refused = [];
$actions()->player($server, $steve, 'move', ['from' => 'inventory.0', 'to' => 'inventory.5']);
$actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'inventory.6']);
$actions()->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 2]);
check('actions by their vanilla names', [$fake->sent, $fake->refused], [[
    'minecraft:item replace entity Steve hotbar.5 from entity Steve hotbar.0',
    'minecraft:execute if items entity Steve hotbar.5 * run minecraft:item replace entity Steve hotbar.0 with minecraft:air',
    'minecraft:execute unless items entity Steve hotbar.6 * run minecraft:item replace entity Steve hotbar.6 with minecraft:diamond 2',
    'minecraft:give Steve minecraft:diamond 2',
], []]);
$fake->bukkit = false;
$fake->plugin = [];

// Offline mode lets in names commands cannot name ("Bob!"): the page says so rather than failing,
// and a name of digits alone is no crash either.
$bob = '22222222-2222-4222-8222-222222222222';
$usercache = $fake->files['usercache.json'];
$fake->files['usercache.json'] = json_encode([...json_decode($usercache, true), ['name' => 'Bob!', 'uuid' => $bob]]);
$fake->online = ['Steve', 'Bob!'];
$page = $players()->profile($server, $bob);
check('a name commands cannot name', [$page['online'], $page['source'], str_contains((string) $page['liveError'], 'Commands cannot name "Bob!"')], [true, 'none', true]);
$fake->files['usercache.json'] = $usercache;
$fake->online = ['Steve'];
$fake->plugin = ['list' => 'There are 1/20 players online:2008'];
check('a name of digits alone', array_column($players()->all($server), 'online', 'name'), ['Steve' => false, 'Alex' => false]);
$fake->plugin = [];

// A player RCON names online who answers no field has left: the page says what the server answered.
$fake->live['Steve'] = [];
$gone = $players()->profile($server, $steve);
check('an online player who answers nothing', [$gone['source'], str_contains((string) $gone['liveError'], 'Found no elements')], ['none', true]);

// Running, Alex offline as RCON says: their file changes, as the server does not hold it.
$fake->files["world/playerdata/{$alex}.dat"] = Nbt::write(Tag::compound(['DataVersion' => Tag::int(4325), 'foodLevel' => Tag::int(3)]));
$sent = count($fake->sent);
$actions()->player($server, $alex, 'feed', []);
check('offline player of a running server', [PlayerFile::load($fake->files["world/playerdata/{$alex}.dat"])->root->get('foodLevel')->value, count($fake->sent)], [20, $sent]);
throws('an offline player is not messaged', fn () => $actions()->player($server, $alex, 'message', ['text' => 'hi']), 'offline');
check('an offline player of a running server is read from their file', $players()->profile($server, $alex)['source'], 'file');

// RCON turned on but not answering: it says why, and nothing is guessed.
$fake->rconUp = false;
$presence = $players()->presence($server);
check('RCON not answering', [$presence['known'], $presence['rcon']['state'], str_contains((string) $presence['rcon']['error'], 'not reachable')], [false, 'error', true]);
$page = $players()->profile($server, $steve);
check('RCON not answering: the player shows their last save', [$page['source'], $page['online'], $page['saved'], $page['rcon']['state']], ['file', null, true, 'error']);
$fake->rconUp = true;

// Wings failing to read a list: the change fails rather than writing an empty list.
$fake->state = 'offline';
$fake->failReads = true;
try {
    $actions()->player($server, $steve, 'deop', []);
    check('failed read throws', false, true);
} catch (Throwable $exception) {
    check('failed read throws', $exception instanceof DaemonConnectionException, true);
}

// Worlds: one per folder with a level.dat, Bukkit's dimension folders shown with their world.
$fake->failReads = false;
$level = fn (string $name, int $played) => Nbt::write(Tag::compound(['Data' => Tag::compound(['LevelName' => Tag::string($name), 'LastPlayed' => new Tag(Tag::LONG, $played), 'Version' => Tag::compound(['Name' => Tag::string('1.21.5')])])]));
$fake->files['world_nether/level.dat'] = $level('world', 0);
$fake->files['world_the_end/DIM1/region/r.0.0.mca'] = 'x';
$fake->files['creative/level.dat'] = $level('Creative build', 1761300000000);
$fake->files['plugins/Essentials.jar'] = 'x';
$archives = new FakeArchives();
$worlds = new OlivierDutoit\Minecraft\Worlds\Worlds($files, new World($files), new OlivierDutoit\Minecraft\Worlds\WorldFiles($archives, $archives, $archives, $archives, $archives));
$listed = $worlds->all($server);
check('worlds', array_map(fn (array $world): array => [$world['folder'], $world['folders'], $world['active'], $world['name']], $listed), [
    ['world', ['world', 'world_nether', 'world_the_end'], true, 'world'],
    ['creative', ['creative'], false, 'Creative build'],
]);
check('last played', $listed[1]['lastPlayed'], date(DATE_ATOM, 1761300000));
throws('the active world stays', fn () => $worlds->delete($server, 'world'), 'active world');
$worlds->delete($server, 'creative');
check('deleting a world deletes its folders', $archives->deleted, [['/', ['creative']]]);
throws('folder names are checked', fn () => $worlds->activate($server, '../etc'), 'not a world folder');
throws('no overwriting a folder', fn () => $worlds->create($server, 'plugins', null, null), 'already');
$worlds->create($server, 'skyblock', '12345', 'minecraft:flat');
$properties = Properties::parse($fake->files['server.properties']);
check('a new world loads at the next start', [$properties->get('level-name'), $properties->get('level-seed'), $properties->get('level-type'), $properties->get('online-mode')], ['skyblock', '12345', 'minecraft:flat', 'true']);

// A world of 26.1 and later: players in players/data, rules, weather and seed in data/minecraft.
$modern = new FakeServer();
rconOf($modern);
$modern->files = [
    'server.properties' => "level-name=world\nenable-rcon=true\nrcon.password=secret\n",
    'usercache.json' => json_encode([['name' => 'Steve', 'uuid' => $steve]]),
    'world/level.dat' => Nbt::write(Tag::compound(['Data' => Tag::compound([
        'LevelName' => Tag::string('world'),
        'DataVersion' => Tag::int(4671),
        'Version' => Tag::compound(['Name' => Tag::string('26.1')]),
        'spawn' => Tag::compound(['pos' => new Tag(Tag::INT_ARRAY, [10, 70, -20]), 'dimension' => Tag::string('minecraft:overworld')]),
        'difficulty_settings' => Tag::compound(['difficulty' => Tag::string('hard'), 'hardcore' => Tag::byte(1)]),
    ])])),
    'world/data/minecraft/game_rules.dat' => Nbt::write(Tag::compound(['data' => Tag::compound(['minecraft:keep_inventory' => Tag::byte(1), 'minecraft:random_tick_speed' => Tag::int(3)]), 'DataVersion' => Tag::int(4671)])),
    'world/data/minecraft/weather.dat' => Nbt::write(Tag::compound(['data' => Tag::compound(['raining' => Tag::byte(1), 'rain_time' => Tag::int(1200)])])),
    'world/data/minecraft/world_gen_settings.dat' => Nbt::write(Tag::compound(['data' => Tag::compound(['seed' => new Tag(Tag::LONG, -4172144997902289642)])])),
    'world/data/minecraft/world_clocks.dat' => Nbt::write(Tag::compound(['data' => Tag::compound(['minecraft:overworld' => Tag::compound(['total_ticks' => new Tag(Tag::LONG, 13000)])])])),
    "world/players/data/{$steve}.dat" => Nbt::write(Tag::compound(['DataVersion' => Tag::int(4671), 'Health' => Tag::float(9.0), 'Inventory' => Tag::list(Tag::COMPOUND)])),
    "world/players/stats/{$steve}.json" => json_encode(['stats' => ['minecraft:custom' => ['minecraft:deaths' => 4]]]),
];
$modernFiles = new MinecraftServer($modern, $modern, $modern);
$modernPlayers = new Players($modernFiles, new ServerConsole($modern, new State($modern)), new Lists($modernFiles), new ServerRcon($modernFiles));
check('both layouts are looked in, newest first', $modernFiles->playerFolders($server), ['data' => ['world/players/data', 'world/playerdata'], 'stats' => ['world/players/stats', 'world/stats']]);
$profile = $modernPlayers->profile($server, $steve);
check('26.1 player read', [$profile['saved'], $profile['health'], $profile['stats']['deaths'] ?? null, $profile['lastSeen'] !== null], [true, 9.0, 4, true]);
$info = (new World($modernFiles))->info($server);
check('26.1 world', [$info['version'], $info['seed'], $info['spawn'], $info['hardcore'], $info['raining'], $info['dayTime'], $info['rules']], [
    '26.1', '-4172144997902289642', ['x' => 10, 'y' => 70, 'z' => -20], true, true, 13000,
    ['minecraft:keep_inventory' => 'true', 'minecraft:random_tick_speed' => '3'],
]);

// The running world, over RCON: the time, the weather and each rule the save names, as the server
// holds them now; a rule the server does not know goes.
$modern->state = 'running';
$modern->dayTime = 18000;
$modern->thundering = true;
$modern->raining = true;
$modern->rules = ['minecraft:keep_inventory' => 'false'];
$running = (new WorldLive(new ServerRcon($modernFiles), $modernFiles))->read($server, $info);
check('the running world, live', [$running['dayTime'], $running['raining'], $running['thundering'], $running['rules'], $running['seed']], [18000, true, true, ['minecraft:keep_inventory' => 'false'], '-4172144997902289642']);
check('one question per value', array_slice($modern->asked, -6), ['minecraft:time query daytime', 'time query daytime', 'execute if predicate {condition:"minecraft:weather_check",thundering:true}', 'execute if predicate {condition:"minecraft:weather_check",raining:true}', 'gamerule minecraft:keep_inventory', 'gamerule minecraft:random_tick_speed']);
// EssentialsX takes `time` on Paper and answers in its own words: the vanilla command keeps the name
// `minecraft:time`.
$modern->bukkit = true;
$modern->plugin = ['time' => 'The current time in world is 18:00 or 6:00 PM or 12000 ticks.'];
check('a plugin taking `time` changes nothing', (new WorldLive(new ServerRcon($modernFiles), $modernFiles))->read($server, $info)['dayTime'], 18000);
$modern->plugin = ['time' => 'Usage: /time [set|add] [day|night|dawn|17:30|4pm|4000ticks] [worldname|all]'];
$modern->bukkit = false;
check('no vanilla `time`: the time is unknown', (new WorldLive(new ServerRcon($modernFiles), $modernFiles))->read($server, $info)['dayTime'], null);

// RCON: turned on on a free allocation port.
$rconFake = new FakeServer();
rconOf($rconFake);
$rconFake->files = [
    'server.properties' => "level-name=world\nserver-port=25565\n",
    'world/level.dat' => $fake->files['world/level.dat'],
];
$rconServer = new Server();
$rconServer->uuid = 'server-rcon';
$rconServer->ports = [25590, 25565, 25580];
$rconFiles = new MinecraftServer($rconFake, $rconFake, $rconFake);
$rcon = new ServerRcon($rconFiles);
check('rcon off', $rcon->status($rconServer), ['enabled' => false, 'port' => 25575, 'allocated' => false, 'password' => false, 'ports' => [25580, 25590]]);
throws('rcon off answers nothing', fn () => $rcon->ask($rconServer, ['list uuids']), 'RCON is off');
throws('rcon refuses the game port', fn () => $rcon->enable($rconServer, 25565, false), 'the game or its query uses it');
throws('rcon refuses a port of another server', fn () => $rcon->enable($rconServer, 25600, false), 'not one of');
// Without a password yet, one is written even when the user keeps "the current one".
$rcon->enable($rconServer, 25590, false);
$written = Properties::parse($rconFake->files['server.properties']);
check('rcon turned on', [$written->get('enable-rcon'), $written->get('rcon.port'), preg_match('/^[0-9a-f]{32}$/', (string) $written->get('rcon.password')), $written->get('broadcast-rcon-to-ops'), $written->get('server-port')], ['true', '25590', 1, 'false', '25565']);
check('rcon status', array_slice($rcon->status($rconServer), 0, 4), ['enabled' => true, 'port' => 25590, 'allocated' => true, 'password' => true]);
// A password of the user's own stays, unless they ask for a new one.
$rconFake->files['server.properties'] = $written->set('rcon.password', 'my-own-password')->contents();
// The user changed the file: the next request reads it again.
$rcon = new ServerRcon(new MinecraftServer($rconFake, $rconFake, $rconFake));
$rcon->enable($rconServer, 25580, false);
check('rcon keeps the password', Properties::parse($rconFake->files['server.properties'])->get('rcon.password'), 'my-own-password');
$rcon->enable($rconServer, 25590, true);
check('rcon replaces the password on demand', preg_match('/^[0-9a-f]{32}$/', (string) Properties::parse($rconFake->files['server.properties'])->get('rcon.password')), 1);
$rconFake->state = 'running';
check('rcon answers once on', $rcon->ask($rconServer, ['list uuids']), ['There are 0 of a max of 20 players online: ']);

echo $failures === 0 ? "ok {$count} checks\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
