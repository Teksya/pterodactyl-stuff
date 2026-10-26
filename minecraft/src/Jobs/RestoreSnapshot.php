<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\MinecraftProvider;
use OlivierDutoit\Minecraft\Models\Snapshot;
use OlivierDutoit\Minecraft\Worlds\Snapshots;
use Pterodactyl\Services\Extensions\ExtensionJobProgress;
use Throwable;

/** Restores a snapshot in the background, reporting each step to the page. */
final class RestoreSnapshot implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    public function __construct(
        public readonly int $snapshotId,
        public readonly bool $safety,
        public readonly string $progressId,
    ) {}

    public function handle(Snapshots $snapshots, ExtensionJobProgress $progress): void
    {
        $snapshot = Snapshot::query()->with('server')->find($this->snapshotId);
        if (! $snapshot instanceof Snapshot || $snapshot->server === null) {
            $this->report($progress, 100, 'The snapshot no longer exists.', 'failed');

            return;
        }

        try {
            $snapshots->restore($snapshot->server, $snapshot, $this->safety, fn (int $percent, string $message) => $this->report($progress, $percent, $message));
            $this->report($progress, 100, "\"{$snapshot->name}\" restored.", 'completed');
        } catch (Throwable $exception) {
            $this->report($progress, 100, mb_substr($exception->getMessage(), 0, 900), 'failed');
            if (! $exception instanceof InvalidArgumentException) {
                report($exception);
            }
        }
    }

    /** Progress is shown to the user; failing to show it never stops a restore halfway. */
    private function report(ExtensionJobProgress $progress, int $percent, string $message, string $status = 'running'): void
    {
        try {
            $progress->update(MinecraftProvider::ID, $this->progressId, $percent, $message, $status);
        } catch (Throwable) {
            // The page stopped following the job: it goes on.
        }
    }
}
