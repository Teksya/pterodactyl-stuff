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
    // The source is emptied only once the item is in the target.
    ['item replace entity Steve enderchest.3 from entity Steve hotbar.0', 'execute if items entity Steve enderchest.3 * run item replace entity Steve hotbar.0 with minecraft:air'],
    ['title Steve title {"text":"Join discord.gg/x"}'],
]);
check('commands that check the slot themselves', [
    Commands::player('Steve', 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'inventory.6'], 4325),
    Commands::player('Steve', 'give', ['item' => 'diamond', 'count' => 2, 'slot' => 'armor.chest'], 2724),
    Commands::player('Steve', 'move', ['from' => 'inventory.0', 'to' => 'inventory.5'], 2724),
], [
    ['execute unless items entity Steve hotbar.6 * run item replace entity Steve hotbar.6 with minecraft:diamond 2'],
    ['execute unless data entity Steve Inventory[{Slot:102b}] run item replace entity Steve armor.chest with minecraft:diamond 2'],
    ['item replace entity Steve hotbar.5 from entity Steve hotbar.0', 'execute if data entity Steve Inventory[{Slot:5b}] run item replace entity Steve hotbar.0 with minecraft:air'],
]);
// On a server that keeps the vanilla commands as `minecraft:<name>`, the command `execute` runs too.
check('vanilla names', [
    Commands::vanilla('give Steve minecraft:diamond 1', 'minecraft:'),
    Commands::vanilla('execute in minecraft:the_nether run tp Steve 0 64 0', 'minecraft:'),
    Commands::vanilla('say we run', 'minecraft:'),
    Commands::vanilla('minecraft:give Steve minecraft:stone 1', 'minecraft:'),
    Commands::vanilla('give Steve minecraft:diamond 1', ''),
], [
    'minecraft:give Steve minecraft:diamond 1',
    'minecraft:execute in minecraft:the_nether run minecraft:tp Steve 0 64 0',
    'minecraft:say we run',
    'minecraft:give Steve minecraft:stone 1',
    'give Steve minecraft:diamond 1',
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

// The answers of `list uuids` over RCON: the names (and UUIDs) after the colon, as each version writes them.
check('vanilla list', Players::parseList('There are 2 of a max of 20 players online: Steve (069a79f4-44e9-4726-a5be-fca90e38aaf5), Alex (11111111-1111-4111-8111-111111111111)'), ['online' => 2, 'max' => 20, 'players' => [['name' => 'Steve', 'uuid' => '069a79f4-44e9-4726-a5be-fca90e38aaf5'], ['name' => 'Alex', 'uuid' => '11111111-1111-4111-8111-111111111111']], 'complete' => true]);
check('names alone', Players::parseList('There are 2 of a max of 20 players online: Steve, Alex'), ['online' => 2, 'max' => 20, 'players' => [['name' => 'Steve', 'uuid' => null], ['name' => 'Alex', 'uuid' => null]], 'complete' => true]);
check('1.12 list', Players::parseList('There are 1/20 players online:Steve'), ['online' => 1, 'max' => 20, 'players' => [['name' => 'Steve', 'uuid' => null]], 'complete' => true]);
check('bukkit list with a rank', Players::parseList("There are 1/10 players online:\n[Admin] Notch"), ['online' => 1, 'max' => 10, 'players' => [['name' => 'Notch', 'uuid' => null]], 'complete' => true]);
check('empty list', Players::parseList('There are 0 of a max of 20 players online: '), ['online' => 0, 'max' => 20, 'players' => [], 'complete' => true]);
// Offline mode lets in names that are not Mojang's ("Bob!", "Ann.", "Bo,b"): each is found by its UUID.
check('any name without a space', array_column(Players::parseList('There are 3 of a max of 20 players online: Bob! (069a79f4-44e9-4726-a5be-fca90e38aaf5), Ann. (11111111-1111-4111-8111-111111111111), Bo,b (22222222-2222-4222-8222-222222222222)')['players'], 'name', 'uuid'), [
    '069a79f4-44e9-4726-a5be-fca90e38aaf5' => 'Bob!', '11111111-1111-4111-8111-111111111111' => 'Ann.', '22222222-2222-4222-8222-222222222222' => 'Bo,b',
]);
// Fewer players read than the count: the list is not the whole truth.
check('a list read in part', Players::parseList('There are 2 of a max of 20 players online: Steve (069a79f4-44e9-4726-a5be-fca90e38aaf5), ???')['complete'], false);
// An answer the server cut short: no UUID fragment taken for a name, no cut name kept.
check('a list cut in a UUID', Players::parseList('There are 1 of a max of 20 players online: Olivier_D (069a79f4-44e9-4726-a5be-fca9...'), ['online' => 1, 'max' => 20, 'players' => [], 'complete' => false]);
check('a list cut in a name', Players::parseList('There are 2/20 players online:Steve, Ale...'), ['online' => 2, 'max' => 20, 'players' => [['name' => 'Steve', 'uuid' => null]], 'complete' => false]);

// One reading of a `data get` answer: empty only for "Found no elements matching" the very path asked.
check('answers of data get', [
    OlivierDutoit\Minecraft\Players\LivePlayer::answer('Found no elements matching Inventory[{Slot:5b}]', 'Inventory[{Slot:5b}]')[0],
    OlivierDutoit\Minecraft\Players\LivePlayer::answer('Found no elements matching active_effects', 'Inventory[{Slot:5b}]')[0],
    OlivierDutoit\Minecraft\Players\LivePlayer::answer('Steve has the following entity data: {Slot: 5b, id: "minecraft:stone", count: 1}', 'Inventory[{Slot:5b}]')[0],
    OlivierDutoit\Minecraft\Players\LivePlayer::answer('Steve has the following entity data: {Slot: 5b, id: "minecraft:st...', 'Inventory[{Slot:5b}]'),
    OlivierDutoit\Minecraft\Players\LivePlayer::answer('No entity was found', 'Health'),
], ['none', 'other', 'value', ['unreadable', 'The server cut its answer short.'], ['other', 'The server answered: No entity was found']]);
throws('another answer is no list', fn () => Players::parseList('Unknown command. Type "/help" for help.'), 'The server answered');
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
                2 => match ($body) {
                    'long' => [$this->reply($id, 0, str_repeat('a', 4096)), $this->reply($id, 0, "b\u{00A7}cc")],
                    // An answer without end, 4096 bytes at a time.
                    'flood' => array_map(fn (): mixed => $this->reply($id, 0, str_repeat('a', 4096)), range(1, 600)),
                    default => $this->reply($id, 0, "\u{00A7}a{$body} done"),
                },
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
$rconClient = function (string $password, int $timeout = 2): RconClient {
    $client = (new ReflectionClass(RconClient::class))->newInstanceWithoutConstructor();
    (function () use ($password, $timeout): void {
        $this->socket = fopen('fakercon://server', 'r+');
        $this->timeout = $timeout;
        $this->authenticate($password);
    })->call($client);

    return $client;
};
$client = $rconClient('secret');
check('rcon commands', [$client->command('list'), $client->command('long'), $client->command('time query day')], ['list done', str_repeat('a', 4096).'bc', 'time query day done']);
throws('rcon wrong password', fn () => $rconClient('wrong'), 'refused the RCON password');
// A server cannot hold the panel: an answer without end stops at 2 MB, and one past its time stops.
throws('rcon answer without end', fn () => $rconClient('secret')->command('flood'), 'longer than 2 MB');
throws('rcon answer past its time', fn () => $rconClient('secret', -10)->command('list'), 'did not answer within');

echo $failures === 0 ? "ok {$count} checks\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
