<?php

/*
 * Tests of snapshots and restores against a server played by stand-ins: its files in memory, archives
 * that hold copies of them, a console and power signals. They check that a restore never loses a
 * world: the current one is set aside, and put back when the extraction fails.
 *
 *     php tests/snapshots.php
 */

declare(strict_types=1);

require __DIR__.'/stubs.php';

use Illuminate\Support\Facades\Cache;
use OlivierDutoit\Minecraft\Models\Snapshot;
use OlivierDutoit\Minecraft\Players\World;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use OlivierDutoit\Minecraft\Worlds\Snapshots;
use OlivierDutoit\Minecraft\Worlds\WorldFiles;
use OlivierDutoit\Minecraft\Worlds\Worlds;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Models\Server;

// The state the stand-in reports is never stale.
Snapshots::$stateCacheSeconds = 0;

$fake = new FakeServer();
$fake->state = 'running';
$fake->files = [
    'server.properties' => "level-name=world\n",
    'world/level.dat' => 'level',
    'world/region/r.0.0.mca' => 'old',
    'world_nether/DIM-1/region/r.0.0.mca' => 'old nether',
    'plugins/Essentials.jar' => 'jar',
];
$archives = new FileArchives($fake);
$power = new Power($fake);
$server = new Server();
$files = new MinecraftServer($fake, $fake, $fake);
$console = new ServerConsole($fake, new Logs($fake), new State($fake));
$worldFiles = new WorldFiles($archives, $archives, $archives, $archives, $archives);
$worlds = new Worlds($files, new World($files), $worldFiles);
$snapshots = new Snapshots($files, $console, new ServerRcon($files), $power, $worldFiles, $worlds, new World($files));
$steps = [];
$progress = function (int $percent, string $message) use (&$steps): void {
    $steps[] = $percent;
};

// Taking one while the server runs: autosave off, flushed, archived, autosave back on.
$first = $snapshots->take($server, 'First', null, Snapshot::MANUAL, 1, $progress);
check('the active world with its Nether', $first->worlds, ['world', 'world_nether']);
check('autosave is paused around the copy', array_values(array_intersect($fake->sent, ['save-off', 'save-all flush', 'save-on'])), ['save-off', 'save-all flush', 'save-on']);
check('the archive moved into .snapshots', [isset($fake->files['.snapshots/'.$first->file()]), isset($fake->files['archive-1.tar.gz'])], [true, false]);
check('progress only goes up', $steps === array_values(array_unique($steps)) && $steps === array_values((function ($s) { sort($s); return $s; })($steps)), true);

// The world changes, then the snapshot comes back: the server stops, a safety snapshot is kept, and
// the server starts again.
$fake->files['world/region/r.0.0.mca'] = 'new';
$steps = [];
$snapshots->restore($server, $first, true, $progress);
check('restored', [$fake->files['world/region/r.0.0.mca'], $fake->files['world_nether/DIM-1/region/r.0.0.mca']], ['old', 'old nether']);
check('stopped then started', $power->signals, ['stop', 'start']);
check('nothing left aside', array_values(array_filter(array_keys($fake->files), fn (string $path): bool => str_contains($path, 'before-restore'))), []);
check('plugins untouched', $fake->files['plugins/Essentials.jar'], 'jar');
$safety = array_values(array_filter(Illuminate\Database\Eloquent\Model::$rows[Snapshot::class], fn (Snapshot $snapshot): bool => $snapshot->kind === Snapshot::SAFETY));
check('a safety snapshot of what it replaced', [count($safety), $safety[0]->worlds ?? null], [1, ['world', 'world_nether']]);
check('the safety snapshot holds the replaced world', $archives->archives['.snapshots/'.$safety[0]->file()]['world/region/r.0.0.mca'] ?? null, 'new');

// An extraction that fails puts the worlds back as they were.
$fake->files['world/region/r.0.0.mca'] = 'current';
$archives->failExtract = new RuntimeException('No space left on device');
try {
    $snapshots->restore($server, $first, false, $progress);
    check('a failed extraction throws', false, true);
} catch (RuntimeException $exception) {
    check('a failed extraction says the worlds are as they were', str_contains($exception->getMessage(), 'The worlds are as they were'), true);
}
check('the world is back', [$fake->files['world/region/r.0.0.mca'] ?? null, $fake->files['world_nether/DIM-1/region/r.0.0.mca'] ?? null], ['current', 'old nether']);
check('nothing aside after a rollback', array_values(array_filter(array_keys($fake->files), fn (string $path): bool => str_contains($path, 'before-restore'))), []);

// Wings timing out may still be extracting: the old worlds stay aside, and the user is told where.
$archives->failExtract = new DaemonConnectionException('Timed out.', 504);
try {
    $snapshots->restore($server, $first, false, $progress);
    check('a timeout throws', false, true);
} catch (RuntimeException $exception) {
    check('a timeout names where the worlds are', str_contains($exception->getMessage(), 'world.before-restore-'), true);
}
$aside = array_values(array_filter(array_keys($fake->files), fn (string $path): bool => str_starts_with($path, 'world.before-restore-') && str_ends_with($path, 'r.0.0.mca')));
check('the old world is kept aside', count($aside) === 1 && $fake->files[$aside[0]] === 'current', true);

// One job at a time per server.
Cache::$locks['minecraft:worlds:'.$server->uuid] = true;
throws('a second job waits', fn () => $snapshots->take($server, 'Second', null, Snapshot::MANUAL, 1, $progress), 'is running');
throws('a deletion waits too', fn () => $snapshots->delete($server, $first), 'is running');
unset(Cache::$locks['minecraft:worlds:'.$server->uuid]);

// A snapshot whose archive is gone is not restored.
unset($fake->files['.snapshots/'.$first->file()]);
throws('a missing archive', fn () => $snapshots->restore($server, $first, false, $progress), 'gone');

// Only the server's worlds: not plugins, not a dimension on its own.
throws('plugins is no world', fn () => $worlds->find($server, 'plugins'), 'not a world');
throws('a dimension is no world on its own', fn () => $worlds->find($server, 'world_nether'), 'not a world');

echo $failures === 0 ? "ok {$count} checks\n" : "{$failures} of {$count} checks failed\n";
exit($failures === 0 ? 0 : 1);
