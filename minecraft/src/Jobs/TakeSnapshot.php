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
use OlivierDutoit\Minecraft\Models\SnapshotSchedule;
use OlivierDutoit\Minecraft\Worlds\Snapshots;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Extensions\ExtensionJobProgress;
use Throwable;

/** Takes a snapshot in the background: from the page (with progress) or from the schedule. */
final class TakeSnapshot implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 3600;

    /** @param list<string>|null $worlds */
    public function __construct(
        public readonly int $serverId,
        public readonly string $name,
        public readonly ?array $worlds,
        public readonly string $kind,
        public readonly ?int $userId,
        public readonly ?string $progressId,
    ) {}

    public function handle(Snapshots $snapshots, ExtensionJobProgress $progress): void
    {
        $server = Server::query()->find($this->serverId);
        if (! $server instanceof Server) {
            return;
        }

        try {
            $snapshot = $snapshots->take($server, $this->name, $this->worlds, $this->kind, $this->userId, fn (int $percent, string $message) => $this->report($progress, $percent, $message));
            if ($this->kind === Snapshot::SCHEDULED) {
                SnapshotSchedule::query()->where('server_id', $server->id)->update(['last_run_at' => now()]);
            }
            $this->report($progress, 100, "Snapshot \"{$snapshot->name}\" taken.", 'completed');
        } catch (Throwable $exception) {
            $this->report($progress, 100, mb_substr($exception->getMessage(), 0, 900), 'failed');
            if (! $exception instanceof InvalidArgumentException) {
                report($exception);
            }
        }
    }

    /** Progress is shown to the user; failing to show it never stops the snapshot. */
    private function report(ExtensionJobProgress $progress, int $percent, string $message, string $status = 'running'): void
    {
        if ($this->progressId === null) {
            return;
        }
        try {
            $progress->update(MinecraftProvider::ID, $this->progressId, $percent, $message, $status);
        } catch (Throwable) {
            // The page stopped following the job: it goes on.
        }
    }
}
