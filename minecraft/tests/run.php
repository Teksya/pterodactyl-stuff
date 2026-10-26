<?php

/*
 * Tests of the classes that need neither Laravel nor Wings: NBT, player files, commands, statistics,
 * the answers of `list` and of the status ping, server.properties. Run with any PHP 8.3:
 *
 *     php tests/run.php
 */

declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    $prefix = 'OlivierDutoit\\Minecraft\\';
    if (str_starts_with($class, $prefix)) {
        require __DIR__.'/../src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    }
});

use OlivierDutoit\Minecraft\Nbt\Nbt;
use OlivierDutoit\Minecraft\Nbt\Tag;
use OlivierDutoit\Minecraft\Players\Commands;
use OlivierDutoit\Minecraft\Players\Lists;
use OlivierDutoit\Minecraft\Players\PlayerFile;
use OlivierDutoit\Minecraft\Players\PlayerProfile;
use OlivierDutoit\Minecraft\Players\Players;
use OlivierDutoit\Minecraft\Players\Stats;
use OlivierDutoit\Minecraft\Rcon\RconClient;
use OlivierDutoit\Minecraft\Server\Properties;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\StatusPing;

$failures = 0;
$count = 0;

function check(string $what, mixed $actual, mixed $expected): void
{
    global $failures, $count;
    $count++;
    if ($actual !== $expected) {
        $failures++;
        echo "FAIL {$what}\n  expected: ".var_export($expected, true)."\n  actual:   ".var_export($actual, true)."\n";
    }
}

function throws(string $what, callable $run, string $message): void
{
    global $failures, $count;
    $count++;
    try {
        $run();
        $failures++;
        echo "FAIL {$what}: nothing thrown\n";
    } catch (InvalidArgumentException|RuntimeException $exception) {
        if (! str_contains($exception->getMessage(), $message)) {
            $failures++;
            echo "FAIL {$what}: {$exception->getMessage()}\n";
        }
    }
}

// NBT: every tag type survives a write and a read, strings in modified UTF-8 included.
$root = Tag::compound([
    'byte' => Tag::byte(-5),
    'short' => Tag::short(-300),
    'int' => Tag::int(-70000),
    'long' => new Tag(Tag::LONG, -5000000000),
    'float' => Tag::float(1.5),
    'double' => Tag::double(-2.25),
    'bytes' => new Tag(Tag::BYTE_ARRAY, [1, -1, 0]),
    'text' => Tag::string("Épée 🗡 \0 end"),
    'list' => Tag::list(Tag::INT, [Tag::int(1), Tag::int(2)]),
    'empty' => Tag::list(Tag::COMPOUND),
    'ints' => new Tag(Tag::INT_ARRAY, [1, -2, 2147483647]),
    'longs' => new Tag(Tag::LONG_ARRAY, [PHP_INT_MAX, -1]),
    'nested' => Tag::compound(['a' => Tag::compound(['b' => Tag::string('c')])]),
]);
$read = Nbt::read(Nbt::write($root));
check('nbt round trip', $read->plain(), $root->plain());
check('nbt keeps types', [$read->get('short')->type, $read->get('float')->type, $read->get('list')->listType], [Tag::SHORT, Tag::FLOAT, Tag::INT]);
$raw = gzdecode(Nbt::write($root));
check('nbt writes modified UTF-8', str_contains($raw, "\xED\xA0\xBD\xED\xB7\xA1") && str_contains($raw, "\xC0\x80") && ! str_contains($raw, "\xF0\x9F"), true);

// A player file of 1.21.5 and later: components, equipment, int counts.
$modern = PlayerFile::load(Nbt::write(Tag::compound([
    'DataVersion' => Tag::int(4325),
    'Health' => Tag::float(4.0),
    'Inventory' => Tag::list(Tag::COMPOUND, [Tag::compound(['Slot' => Tag::byte(0), 'id' => Tag::string('minecraft:diamond_sword'), 'count' => Tag::int(1)])]),
    'equipment' => Tag::compound(['head' => Tag::compound(['id' => Tag::string('minecraft:iron_helmet'), 'count' => Tag::int(1)])]),
    'Dimension' => Tag::string('minecraft:overworld'),
])));
check('modern give goes to the first free slot', $modern->give('minecraft:stone', 64), 'inventory.1');
$modern->move('inventory.0', 'armor.feet');
$modern->move('armor.head', 'inventory.5');
$modern->heal(20.0);
$modern->teleport(1.5, 64, -3, 'minecraft:the_nether');
$modern->gamemode('creative');
$saved = PlayerFile::load($modern->contents());
$profile = PlayerProfile::from($saved->root->plain());
check('modern inventory', array_map(fn (array $item): array => [$item['slot'], $item['id'], $item['count']], $profile['inventory']), [['inventory.1', 'minecraft:stone', 64], ['inventory.5', 'minecraft:iron_helmet', 1]]);
check('modern armour in equipment', [$profile['armor']['feet']['id'] ?? null, $profile['armor']['head'], $saved->root->get('equipment')->get('feet')->get('Slot')], ['minecraft:diamond_sword', null, null]);
check('modern count stays an int', $saved->item('inventory.1')->get('count')->type, Tag::INT);
check('modern health, place, mode', [$profile['health'], $profile['dimension'], $profile['position'], $profile['gamemode']], [20.0, 'minecraft:the_nether', ['x' => 1.5, 'y' => 64.0, 'z' => -3.0], 'creative']);

// A 1.12 player file: armour in the inventory, byte counts, damage, numeric dimension, short health.
$legacy = PlayerFile::load(Nbt::write(Tag::compound([
    'DataVersion' => Tag::int(1343),
    'Health' => Tag::short(5),
    'HealF' => Tag::float(5.0),
    'Dimension' => Tag::int(0),
    'Inventory' => Tag::list(Tag::COMPOUND, [
        Tag::compound(['Slot' => Tag::byte(103), 'id' => Tag::string('minecraft:iron_helmet'), 'Count' => Tag::byte(1), 'Damage' => Tag::short(3)]),
        Tag::compound(['Slot' => Tag::byte(-106), 'id' => Tag::string('minecraft:shield'), 'Count' => Tag::byte(1), 'Damage' => Tag::short(0)]),
    ]),
])));
$legacy->give('minecraft:stone', 64, 'inventory.9');
$legacy->move('armor.head', 'offhand');
$legacy->heal(20.0);
$legacy->teleport(0, 70, 0, 'minecraft:the_end');
$saved = PlayerFile::load($legacy->contents());
$profile = PlayerProfile::from($saved->root->plain());
check('legacy swap keeps armour slots', [$profile['offhand']['id'], $profile['armor']['head']['id']], ['minecraft:iron_helmet', 'minecraft:shield']);
check('legacy item format', [$saved->item('inventory.9')->get('Count')->type, $saved->item('inventory.9')->get('Damage')->value, $saved->item('offhand')->get('Slot')->value], [Tag::BYTE, 0, -106]);
check('legacy health stays a short', [$saved->root->get('Health')->type, $saved->root->get('Health')->value, $saved->root->get('HealF')->value], [Tag::SHORT, 20, 20.0]);
check('legacy dimension stays a number', $saved->root->get('Dimension')->value, 1);
throws('legacy dimensions', fn () => $legacy->teleport(0, 0, 0, 'mymod:moon'), 'overworld');
throws('move from an empty slot', fn () => $legacy->move('inventory.20', 'inventory.21'), 'empty');

// Items of 1.20.5 to 1.21.4 and before: enchantments, names, damage.
$items = PlayerProfile::from([
    'Inventory' => [
        ['Slot' => 0, 'id' => 'minecraft:diamond_sword', 'count' => 1, 'components' => ['minecraft:enchantments' => ['levels' => ['minecraft:sharpness' => 5]], 'minecraft:damage' => 12, 'minecraft:custom_name' => '{"text":"Blade"}']],
        ['Slot' => 1, 'id' => 'minecraft:bow', 'Count' => 1, 'tag' => ['Enchantments' => [['id' => 'minecraft:power', 'lvl' => 3]], 'display' => ['Name' => 'true'], 'Damage' => 4]],
        ['Slot' => 2, 'id' => 'minecraft:book', 'count' => 1, 'components' => ['minecraft:stored_enchantments' => ['minecraft:mending' => 1]]],
    ],
    'active_effects' => [['id' => 'minecraft:speed', 'amplifier' => 1, 'duration' => 200]],
    'ActiveEffects' => [['Id' => 16, 'Amplifier' => 0, 'Duration' => 100]],
])['inventory'];
check('item enchantments of each era', array_map(fn (array $item): array => $item['enchantments'], $items), [[['id' => 'minecraft:sharpness', 'level' => 5]], [['id' => 'minecraft:power', 'level' => 3]], [['id' => 'minecraft:mending', 'level' => 1]]]);
check('item names and damage', [$items[0]['name'], $items[0]['damage'], $items[1]['name'], $items[1]['damage']], ['Blade', 12, 'true', 4]);

// Commands of each version.
check('modern commands', [
    Commands::player('Steve', 'heal', []),
    Commands::player('Steve', 'remove_slot', ['slot' => 'inventory.9'], 4325),
    Commands::player('Steve', 'move', ['from' => 'inventory.0', 'to' => 'ender.3'], 4325),
    Commands::player('Steve', 'title', ['text' => 'Join discord.gg/x'], 4325),
], [
    ['effect give Steve minecraft:instant_health 1 10 true'],
    ['item replace entity Steve inventory.0 with minecraft:air'],
    ['item replace entity Steve enderchest.3 from entity Steve hotbar.0', 'item replace entity Steve hotbar.0 with minecraft:air'],
    ['title Steve title {"text":"Join discord.gg/x"}'],
]);
check('1.16 commands', Commands::player('Steve', 'remove_slot', ['slot' => 'offhand'], 2586), ['replaceitem entity Steve weapon.offhand minecraft:air']);
check('1.12 commands', [
    Commands::player('Steve', 'remove_slot', ['slot' => 'armor.head'], 1343),
    Commands::player('Steve', 'effect_clear', [], 1343),
    Commands::player('Steve', 'xp', ['amount' => 5, 'unit' => 'levels'], 1343),
    Commands::player('Steve', 'feed', [], 1343),
], [
    ['replaceitem entity Steve slot.armor.head minecraft:air'],
    ['effect Steve clear'],
    ['xp 5L Steve'],
    ['effect Steve 23 1 10 true'],
]);
throws('online moves before 1.17', fn () => Commands::player('Steve', 'move', ['from' => 'inventory.0', 'to' => 'inventory.1'], 2586), '1.17');
throws('a line break is no second command', fn () => Commands::player('Steve', 'message', ['text' => ''], 4325), 'message');
check('text loses line breaks', Commands::player('Steve', 'message', ['text' => "hi\nop Hacker"]), ['tell Steve hi op Hacker']);
throws('names are checked', fn () => Commands::player('Steve; op x', 'kick', []), 'not a Minecraft player name');
check('ids get their namespace', Commands::player('Steve', 'give', ['item' => 'Diamond', 'count' => 3]), ['give Steve minecraft:diamond 3']);

// Statistics, 1.13 and later, then the format before.
$stats = Stats::summarise(['stats' => [
    'minecraft:custom' => ['minecraft:play_time' => 72000, 'minecraft:walk_one_cm' => 150000, 'minecraft:fly_one_cm' => 2000, 'minecraft:deaths' => 2],
    'minecraft:mined' => ['minecraft:stone' => 30, 'minecraft:dirt' => 5],
    'minecraft:killed' => ['minecraft:zombie' => 4],
]]);
check('modern stats', [$stats['playTime'], $stats['deaths'], $stats['blocksMined'], $stats['distances'], $stats['mined'][0], $stats['killed']], [72000, 2, 35, [['id' => 'walk', 'blocks' => 1500], ['id' => 'fly', 'blocks' => 20]], ['id' => 'stone', 'count' => 30], [['id' => 'zombie', 'count' => 4]]]);
$stats = Stats::summarise(['stat.playOneMinute' => 100, 'stat.walkOneCm' => 500, 'stat.mineBlock.minecraft.stone' => 7, 'stat.killEntity.EnderDragon' => 1, 'stat.leaveGame' => 3]);
check('legacy stats', [$stats['playTime'], $stats['timesJoined'], $stats['distances'], $stats['mined'], $stats['killed']], [100, 3, [['id' => 'walk', 'blocks' => 5]], [['id' => 'stone', 'count' => 7]], [['id' => 'ender_dragon', 'count' => 1]]]);

// The answers of `list`.
check('vanilla list', Players::parseList('[12:00:00 INFO]: There are 2 of a max of 20 players online: Steve, Alex'), ['online' => 2, 'max' => 20, 'players' => [['name' => 'Steve', 'uuid' => null], ['name' => 'Alex', 'uuid' => null]]]);
check('bukkit list', Players::parseList("[12:00:00 INFO]: There are 1/10 players online:\n[12:00:00 INFO]: [Admin] Notch"), ['online' => 1, 'max' => 10, 'players' => [['name' => 'Notch', 'uuid' => null]]]);
check('empty list', Players::parseList('There are 0 of a max of 20 players online: '), ['online' => 0, 'max' => 20, 'players' => []]);

// The console: only the server's own answers count, and only those printed after the command.
check('a chat line is no answer', [
    ServerConsole::answers('[12:00:00] [Server thread/INFO]: There are 0 of a max of 20 players online: ', '/^There are \d+/i'),
    ServerConsole::answers('[12:00:00] [Server thread/INFO]: <Steve> There are 0 of a max of 20 players online: Admin', '/^There are \d+/i'),
    ServerConsole::answers('[12:00:00 INFO]: Saved the game', '/^(Saved the (game|world))/i'),
    ServerConsole::answers('Saved the world', '/^(Saved the (game|world))/i'),
], [true, false, true, true]);
check('a redrawn prompt before the answer', [
    ServerConsole::text(">\r[12:00:01 INFO]: Steve has the following entity data: 20.0f"),
    ServerConsole::text('> [12:00:01] [Server thread/INFO]: Found no elements matching Air'),
    ServerConsole::answers("\r> [12:00:01 INFO]: Steve has the following entity data: 20.0f", '/^\S+ has the following entity data: /'),
], ['Steve has the following entity data: 20.0f', 'Found no elements matching Air', true]);
check('lines after the command',ServerConsole::after(['a', 'b', 'c'], ['b', 'c', 'd', 'e']), ['d', 'e']);
check('lines after scrolled out', ServerConsole::after(['x', 'y', 'z'], ['d', 'e']), ['d', 'e']);
check('bukkit names line, never chat', [
    Players::listAnswer(['[INFO]: There are 1/10 players online:', '[INFO]: Notch']),
    Players::listAnswer(['[INFO]: There are 0/10 players online:', '[INFO]: <Alex> hi']),
    Players::listAnswer(['[INFO]: There are 1 of a max of 20 players online: Steve', '[INFO]: Steve joined the game']),
], ["[INFO]: There are 1/10 players online:\n[INFO]: Notch", '[INFO]: There are 0/10 players online:', '[INFO]: There are 1 of a max of 20 players online: Steve']);
throws('a name ends at its end', fn () => Players::assertName("Steve\n"), 'not a Minecraft player name');

// Clearing one kind of item, offline.
$file = PlayerFile::load(Nbt::write(Tag::compound([
    'DataVersion' => Tag::int(4325),
    'Inventory' => Tag::list(Tag::COMPOUND, [
        Tag::compound(['Slot' => Tag::byte(0), 'id' => Tag::string('minecraft:dirt'), 'count' => Tag::int(5)]),
        Tag::compound(['Slot' => Tag::byte(1), 'id' => Tag::string('minecraft:stone'), 'count' => Tag::int(5)]),
    ]),
    'equipment' => Tag::compound(['head' => Tag::compound(['id' => Tag::string('minecraft:dirt'), 'count' => Tag::int(1)])]),
])));
$file->clearInventory('minecraft:dirt');
$profile = PlayerProfile::from($file->root->plain());
check('clear one item', [array_column($profile['inventory'], 'id'), $profile['armor']['head']], [['minecraft:stone'], null]);

// The status ping's JSON, with the placeholders of a server that hides its players.
check('ping', StatusPing::parse('{"version":{"name":"Paper 1.21.4"},"players":{"online":3,"max":20,"sample":[{"name":"Steve","id":"069A79F4-44E9-4726-A5BE-FCA90E38AAF5"},{"name":"Anonymous Player","id":"00000000-0000-0000-0000-000000000000"}]}}'), ['online' => 3, 'max' => 20, 'sample' => [['name' => 'Steve', 'uuid' => '069a79f4-44e9-4726-a5be-fca90e38aaf5']], 'version' => 'Paper 1.21.4']);

// The lists' files and UUIDs.
check('offline UUID', Lists::offlineUuid('Steve'), '5627dd98-e6be-3c21-b8a8-e92344183641');
check('two-space indents', Lists::indent(json_encode([['a' => 1]], JSON_PRETTY_PRINT)), "[\n  {\n    \"a\": 1\n  }\n]\n");

// server.properties.
$properties = Properties::parse("#comment\nlevel-type=minecraft\\:normal\nmotd=A \\u00E9t\\u00E9 \\uD83D\\uDE00\n");
check('properties read', [$properties->get('level-type'), $properties->get('motd')], ['minecraft:normal', 'A été 😀']);
check('properties write', $properties->set('enable-rcon', 'true')->set('motd', 'é')->contents(), "#comment\nlevel-type=minecraft\\:normal\nmotd=\\u00E9\nenable-rcon=true\n");

// RCON, against a stream that answers as the vanilla server does: a long answer in 4096-byte pieces.
// It hands out one packet per read, as a socket does when they arrive apart: PHP drops what it has
// buffered from a user stream when the stream is written to.
final class FakeRconStream
{
    public static string $password = 'secret';
    public mixed $context;
    private string $in = '';
    /** @var list<string> */
    private array $out = [];

    public function stream_open(string $path, string $mode, int $options, ?string &$opened): bool
    {
        return true;
    }

    public function stream_write(string $data): int
    {
        $this->in .= $data;
        while (strlen($this->in) >= 4 && strlen($this->in) >= 4 + ($length = unpack('V', $this->in)[1])) {
            ['id' => $id, 'type' => $type] = unpack('Vid/Vtype', substr($this->in, 4, 8));
            $body = substr($this->in, 12, $length - 10);
            $this->in = substr($this->in, 4 + $length);
            match ($type) {
                3 => $this->reply($body === self::$password ? $id : -1, 2, ''),
                2 => $body === 'long'
                    ? [$this->reply($id, 0, str_repeat('a', 4096)), $this->reply($id, 0, "b\u{00A7}cc")]
                    : $this->reply($id, 0, "\u{00A7}a{$body} done"),
                default => $this->reply($id, 0, 'Unknown request 0'),
            };
        }

        return strlen($data);
    }

    public function stream_read(int $count): string
    {
        $packet = array_shift($this->out) ?? '';
        if (strlen($packet) > $count) {
            array_unshift($this->out, substr($packet, $count));
        }

        return substr($packet, 0, $count);
    }

    public function stream_eof(): bool
    {
        return $this->out === [];
    }

    private function reply(int $id, int $type, string $body): void
    {
        $payload = pack('VV', $id & 0xFFFFFFFF, $type).$body."\x00\x00";
        $this->out[] = pack('V', strlen($payload)).$payload;
    }
}
stream_wrapper_register('fakercon', FakeRconStream::class);
$rconClient = function (string $password): RconClient {
    $client = (new ReflectionClass(RconClient::class))->newInstanceWithoutConstructor();
    (function () use ($password): void {
        $this->socket = fopen('fakercon://server', 'r+');
        $this->timeout = 2;
        $this->authenticate($password);
    })->call($client);

    return $client;
};
$client = $rconClient('secret');
check('rcon commands', [$client->command('list'), $client->command('long'), $client->command('time query day')], ['list done', str_repeat('a', 4096).'bc', 'time query day done']);
throws('rcon wrong password', fn () => $rconClient('wrong'), 'refused the RCON password');

echo $failures === 0 ? "ok {$count} checks\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
