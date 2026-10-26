<?php

/*
 * Tests of what actions do, against a server played by stand-ins for the panel's classes: files in
 * memory, a console that records commands and answers `list` and `save-all`, and a power state.
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
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\Properties;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Models\Server;

$steve = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
$alex = '11111111-1111-4111-8111-111111111111';

$fake = new FakeServer();
$fake->files = [
    'server.properties' => "level-name=world\nonline-mode=true\nop-permission-level=3\n",
    'usercache.json' => json_encode([['name' => 'Steve', 'uuid' => $steve], ['name' => 'Alex', 'uuid' => $alex]]),
    'ops.json' => json_encode([['uuid' => $alex, 'name' => 'Alex', 'level' => 2, 'bypassesPlayerLimit' => true]]),
    'world/level.dat' => Nbt::write(Tag::compound(['Data' => Tag::compound(['DataVersion' => Tag::int(4325), 'Version' => Tag::compound(['Name' => Tag::string('1.21.5')])])])),
    "world/playerdata/{$steve}.dat" => Nbt::write(Tag::compound(['DataVersion' => Tag::int(4325), 'playerGameType' => Tag::int(0), 'Inventory' => Tag::list(Tag::COMPOUND)])),
];

$server = new Server();
$files = new MinecraftServer($fake, $fake, $fake);
$console = new ServerConsole($fake, new Logs($fake), new State($fake));
$lists = new Lists($files);
$players = new Players($files, $console, $lists, new ServerRcon($files));
$actions = new Actions($players, $lists, $files, $console);

// Stopped: everyone is offline, and actions change the files.
$all = $players->all($server);
check('players known', array_map(fn (array $player): array => [$player['name'], $player['online'], $player['op']], $all), [['Steve', false, null], ['Alex', false, 2]]);
$actions->player($server, $steve, 'gamemode', ['mode' => 'creative']);
$actions->player($server, $steve, 'give', ['item' => 'diamond', 'count' => 3]);
$file = PlayerFile::load($fake->files["world/playerdata/{$steve}.dat"]);
check('offline edits the file', [$file->root->get('playerGameType')->value, $file->item('inventory.0')->get('id')->value], [1, 'minecraft:diamond']);
$actions->player($server, $steve, 'op', []);
$actions->player($server, $alex, 'op', []);
check('offline op uses the server level and keeps an existing one', array_column(json_decode($fake->files['ops.json'], true), 'level', 'name'), ['Alex' => 2, 'Steve' => 3]);
check('nothing went to the console', $fake->sent, []);
throws('messages need the player', fn () => $actions->player($server, $steve, 'message', ['text' => 'hi']), 'offline');

// A list that cannot be read is never overwritten.
$fake->files['banned-players.json'] = '[{"uuid": "x",]';
throws('broken list', fn () => $actions->player($server, $steve, 'ban', []), 'not a valid JSON list');
check('broken list kept', $fake->files['banned-players.json'], '[{"uuid": "x",]');

// Starting: no file is touched.
$fake->state = 'starting';
throws('starting refuses list files', fn () => $actions->player($server, $steve, 'whitelist_add', []), 'starting');
throws('starting refuses player files', fn () => $actions->player($server, $steve, 'heal', []), 'cannot tell who is online');

// Running, Steve online: commands. The ping is unreachable here, so `list` names who is online.
$fake->state = 'running';
$fake->online = ['Steve'];
$all = $players->all($server);
check('online from list', array_column($all, 'online', 'name'), ['Steve' => true, 'Alex' => false]);
$result = $actions->player($server, $steve, 'heal', []);
check('online heals by command', $result['command'], 'effect give Steve minecraft:instant_health 1 10 true');
$actions->player($server, $alex, 'whitelist_add', []);
check('lists go through the console while running', end($fake->sent), 'whitelist add Alex');
// Online, Steve is read live from the console, his saved file aside.
$fake->live['Steve'] = [
    'Health' => '14.5f',
    'foodLevel' => '17',
    'Pos' => '[12.5d, 64.0d, -3.25d]',
    'Dimension' => '"minecraft:the_nether"',
    'playerGameType' => '1',
    'Inventory' => '[{Slot: 0b, id: "minecraft:diamond_sword", count: 1, components: {"minecraft:enchantments": {"minecraft:sharpness": 5}}}, {Slot: 9b, id: "minecraft:stone", count: 64}]',
    'equipment' => '{head: {id: "minecraft:iron_helmet", count: 1}}',
];
// The page reads online players over RCON only; with RCON off, from their file, as the Pelican plugin.
$page = $players->profile($server, $steve);
check('online without RCON: the file', [$page['source'], $page['liveVia'], $page['gamemode']], ['file', 'off', 'creative']);
$live = $players->live($server, 'Steve');
check('online read live from the console', [$players->liveVia, $live['health'], $live['food'], $live['dimension'], $live['gamemode'], array_column($live['inventory'], 'id', 'slot'), $live['armor']['head']['id'] ?? null, $live['inventory'][0]['enchantments']], [
    'console', 14.5, 17, 'minecraft:the_nether', 'creative', ['inventory.0' => 'minecraft:diamond_sword', 'inventory.9' => 'minecraft:stone'], 'minecraft:iron_helmet', [['id' => 'minecraft:sharpness', 'level' => 5]],
]);
throws('online move into a full slot', fn () => $actions->player($server, $steve, 'move', ['from' => 'inventory.1', 'to' => 'inventory.0']), 'holds an item');
$result = $actions->player($server, $steve, 'move', ['from' => 'inventory.0', 'to' => 'inventory.5']);
check('online move into an empty slot', $result['command'], 'item replace entity Steve hotbar.5 from entity Steve hotbar.0 · item replace entity Steve hotbar.0 with minecraft:air');

// Running, Alex offline: their file changes, as they are not loaded.
$fake->files["world/playerdata/{$alex}.dat"] = Nbt::write(Tag::compound(['DataVersion' => Tag::int(4325), 'foodLevel' => Tag::int(3)]));
$actions->player($server, $alex, 'feed', []);
check('offline player of a running server', PlayerFile::load($fake->files["world/playerdata/{$alex}.dat"])->root->get('foodLevel')->value, 20);

// Wings failing to read a list: the change fails rather than writing an empty list.
$fake->state = 'offline';
$fake->failReads = true;
try {
    $actions->player($server, $steve, 'deop', []);
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
$worlds = new OlivierDutoit\Minecraft\Worlds\Worlds($files, new OlivierDutoit\Minecraft\Players\World($files), new OlivierDutoit\Minecraft\Worlds\WorldFiles($archives, $archives, $archives, $archives, $archives));
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
$properties = OlivierDutoit\Minecraft\Server\Properties::parse($fake->files['server.properties']);
check('a new world loads at the next start', [$properties->get('level-name'), $properties->get('level-seed'), $properties->get('level-type'), $properties->get('online-mode')], ['skyblock', '12345', 'minecraft:flat', 'true']);

// A world of 26.1 and later: players in players/data, rules, weather and seed in data/minecraft.
$modern = new FakeServer();
$modern->files = [
    'server.properties' => "level-name=world\n",
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
$modernConsole = new ServerConsole($modern, new Logs($modern), new State($modern));
$modernPlayers = new Players($modernFiles, $modernConsole, new Lists($modernFiles), new ServerRcon($modernFiles));
check('both layouts are looked in, newest first', $modernFiles->playerFolders($server), ['data' => ['world/players/data', 'world/playerdata'], 'stats' => ['world/players/stats', 'world/stats']]);
$profile = $modernPlayers->profile($server, $steve);
check('26.1 player read', [$profile['saved'], $profile['health'], $profile['stats']['deaths'] ?? null, $profile['lastSeen'] !== null], [true, 9.0, 4, true]);
$info = (new OlivierDutoit\Minecraft\Players\World($modernFiles))->info($server);
check('26.1 world', [$info['version'], $info['seed'], $info['spawn'], $info['hardcore'], $info['raining'], $info['dayTime'], $info['rules']], [
    '26.1', '-4172144997902289642', ['x' => 10, 'y' => 70, 'z' => -20], true, true, 13000,
    ['minecraft:keep_inventory' => 'true', 'minecraft:random_tick_speed' => '3'],
]);

// RCON: turned on on a free allocation port. While it cannot be reached, the console answers.
$rconFake = new FakeServer();
$rconFake->files = [
    'server.properties' => "level-name=world\nserver-port=25565\n",
    'world/level.dat' => $fake->files['world/level.dat'],
];
$rconServer = new Server();
$rconServer->uuid = 'server-rcon';
$rconServer->ports = [25590, 25565, 25580];
$rconFiles = new MinecraftServer($rconFake, $rconFake, $rconFake);
$rcon = new ServerRcon($rconFiles);
check('rcon off', $rcon->status($rconServer), ['enabled' => false, 'port' => 25575, 'allocated' => false, 'ports' => [25580, 25590]]);
check('rcon off runs nothing', $rcon->run($rconServer, ['list']), null);
throws('rcon refuses the game port', fn () => $rcon->enable($rconServer, 25565), 'the game or its query uses it');
throws('rcon refuses a port of another server', fn () => $rcon->enable($rconServer, 25600), 'not one of');
$rcon->enable($rconServer, 25590);
$written = Properties::parse($rconFake->files['server.properties']);
check('rcon turned on', [$written->get('enable-rcon'), $written->get('rcon.port'), preg_match('/^[0-9a-f]{32}$/', (string) $written->get('rcon.password')), $written->get('broadcast-rcon-to-ops'), $written->get('server-port')], ['true', '25590', 1, 'false', '25565']);
check('rcon status', array_slice($rcon->status($rconServer), 0, 3), ['enabled' => true, 'port' => 25590, 'allocated' => true]);

$rconFake->state = 'running';
$rconFake->live['Steve'] = ['Health' => '7.0f', 'foodLevel' => '3'];
$rconPlayers = new Players($rconFiles, new ServerConsole($rconFake, new Logs($rconFake), new State($rconFake)), new Lists($rconFiles), $rcon);
$entity = $rconPlayers->live($rconServer, 'Steve');
check('unreachable rcon falls back to the console', [$entity['health'] ?? null, $entity['food'] ?? null, count(array_filter($rconFake->sent, fn (string $command): bool => str_starts_with($command, 'data get entity Steve'))) > 0], [7.0, 3, true]);
// The page asks RCON only: turned on but not answering, it says so rather than "RCON disabled".
$rconFake->files['usercache.json'] = json_encode([['name' => 'Steve', 'uuid' => $steve]]);
$rconFake->online = ['Steve'];
$rconPage = $rconPlayers->profile($rconServer, $steve);
check('rcon on but unreachable: the page says it did not answer', [$rconPage['online'], $rconPage['source'], $rconPage['liveVia'], str_contains((string) $rconPage['liveError'], 'RCON')], [true, 'file', 'error', true]);

echo $failures === 0 ? "ok {$count} checks\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
