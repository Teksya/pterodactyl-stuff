<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use OlivierDutoit\Minecraft\Jobs\TakeSnapshot;
use OlivierDutoit\Minecraft\Models\Snapshot;
use OlivierDutoit\Minecraft\Models\SnapshotSchedule;
use Symfony\Component\Console\Attribute\AsCommand;

/**
 * Queues the automatic snapshots that are due. A schedule counts as run once its snapshot is taken,
 * so one that fails (the server was starting, Wings did not answer) is tried again at the next tick,
 * at most every half hour.
 */
#[AsCommand(name: 'minecraft:snapshots', description: 'Queue the automatic world snapshots that are due.')]
final class SnapshotsCommand extends Command
{
    protected $signature = 'minecraft:snapshots';

    public function handle(): int
    {
        $queued = 0;
        foreach (SnapshotSchedule::query()->with('server')->where('interval_hours', '>', 0)->get() as $schedule) {
            $server = $schedule->server;
            // Suspended, installing, transferring or restoring a backup: not now.
            if (! $schedule->due() || $server === null || $server->isSuspended() || $server->status !== null) {
                continue;
            }
            if (! Cache::add('minecraft:snapshot-queued:'.$server->id, true, 1800)) {
                continue;
            }

            TakeSnapshot::dispatch($server->id, 'Automatic, '.now()->format('Y-m-d H:i'), null, Snapshot::SCHEDULED, null, null);
            $queued++;
        }

        $this->info("Queued {$queued} snapshot(s).");

        return self::SUCCESS;
    }
}
