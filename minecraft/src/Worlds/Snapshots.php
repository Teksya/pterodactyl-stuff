<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Worlds;

use Closure;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\MinecraftProvider;
use OlivierDutoit\Minecraft\Models\Snapshot;
use OlivierDutoit\Minecraft\Models\SnapshotSchedule;
use OlivierDutoit\Minecraft\Players\World;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerConsole;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\Server;
use RuntimeException;
use Throwable;

/**
 * World snapshots: archives of world folders kept in the server's .snapshots folder.
 *
 * A snapshot of a running server turns autosaving off and flushes the world first, so the archive is
 * whole. A restore stops the server, keeps a snapshot of what it replaces when asked, sets the current
 * folders aside (a rename), extracts the archive, and only then deletes the folders it set aside; if
 * the extraction fails they are put back. Everything that touches snapshots runs under one lock per
 * server.
 */
final class Snapshots
{
    private const int STOP_SECONDS = 120;
    /** Wings' state is cached for up to 20 seconds: a reading is trusted once it is newer than that. */
    public static int $stateCacheSeconds = 22;
    private const string SAVED = '/^(Saved the (game|world)|Save complete|ThreadedAnvilChunkStorage.*All dimensions are saved)/i';

    public function __construct(
        private readonly MinecraftServer $files,
        private readonly ServerConsole $console,
        private readonly SendsServerPower $power,
        private readonly WorldFiles $archives,
        private readonly Worlds $worlds,
        private readonly World $world,
    ) {}

    /**
     * Archives `$folders` (worlds, each with its dimensions), or the active world, then prunes the
     * automatic snapshots of its kind.
     *
     * @param  list<string>|null  $folders
     * @param  Closure(int, string): void  $progress  percent and message; it must not throw.
     */
    public function take(Server $server, string $name, ?array $folders, string $kind, ?int $userId, Closure $progress): Snapshot
    {
        return $this->locked($server, function () use ($server, $name, $folders, $kind, $userId, $progress): Snapshot {
            $folders = $folders === null ? $this->worlds->folders($server, $this->files->world($server)) : $this->expand($server, $folders);
            $snapshot = $this->takeUnlocked($server, $name, $folders, $kind, $userId, $progress);
            $this->pruneQuietly($server, $kind);

            return $snapshot;
        });
    }

    /** @param Closure(int, string): void $progress percent and message; it must not throw. */
    public function restore(Server $server, Snapshot $snapshot, bool $safety, Closure $progress): void
    {
        $this->locked($server, function () use ($server, $snapshot, $safety, $progress): void {
            if (! $this->exists($server, $snapshot)) {
                throw new InvalidArgumentException('The snapshot\'s archive is gone from the .snapshots folder.');
            }

            $wasRunning = in_array($this->console->state($server), ['running', 'starting'], true);
            $progress(5, 'Stopping the server…');
            $this->stop($server);

            // The folders the snapshot brings back, as they are now.
            $current = array_values(array_intersect($snapshot->worlds, $this->folderNames($server)));
            if ($safety && $current !== []) {
                $progress(15, 'Keeping a snapshot of the worlds it replaces…');
                $this->takeUnlocked($server, "Before restoring \"{$snapshot->name}\"", $current, Snapshot::SAFETY, null, fn () => null);
            }

            $progress(50, 'Setting the current worlds aside…');
            $stamp = date('Ymd-His');
            $aside = array_combine($current, array_map(fn (string $folder): string => "{$folder}.before-restore-{$stamp}", $current)) ?: [];
            $this->archives->rename($server, $aside);

            $progress(60, 'Extracting the snapshot…');
            try {
                $this->archives->extract($server, Snapshot::FOLDER.'/'.$snapshot->file());
            } catch (Throwable $exception) {
                $this->recover($server, $snapshot, $aside, $exception);
            }

            $progress(90, 'Deleting the worlds it replaced…');
            try {
                $this->archives->delete($server, '/', array_values($aside));
            } catch (Throwable) {
                // They stay in the server's folder, named *.before-restore-*, to delete by hand.
            }
            $this->pruneQuietly($server, Snapshot::SAFETY, $snapshot->id);

            if ($wasRunning) {
                $progress(95, 'Starting the server…');
                $this->power->send($server, 'start');
            }
        });
    }

    public function delete(Server $server, Snapshot $snapshot): void
    {
        $this->locked($server, fn () => $this->deleteUnlocked($server, $snapshot));
    }

    /** Whether the archive is still in the .snapshots folder. */
    public function exists(Server $server, Snapshot $snapshot): bool
    {
        return in_array($snapshot->file(), array_column($this->files->listOrFail($server, Snapshot::FOLDER), 'name'), true);
    }

    /**
     * Puts the worlds set aside back after a failed extraction, unless Wings may still be extracting
     * (it timed out), in which case they stay aside and the user is told where.
     *
     * @param  array<string, string>  $aside  current name => name aside.
     */
    private function recover(Server $server, Snapshot $snapshot, array $aside, Throwable $exception): never
    {
        $kept = implode(', ', $aside);
        if ($exception instanceof DaemonConnectionException && $exception->getStatusCode() === 504) {
            throw new RuntimeException("Wings did not finish extracting the snapshot in time and may still be at it. The previous worlds are kept as {$kept}: once the extraction ends, check the world, or rename them back in the file manager.", 0, $exception);
        }

        try {
            $partial = array_values(array_intersect($snapshot->worlds, $this->folderNames($server)));
            $this->archives->delete($server, '/', $partial);
            $this->archives->rename($server, array_flip($aside));
        } catch (Throwable) {
            throw new RuntimeException("The snapshot could not be extracted ({$exception->getMessage()}), and the previous worlds could not be put back: they are kept as {$kept}.", 0, $exception);
        }

        throw new RuntimeException("The snapshot could not be extracted ({$exception->getMessage()}). The worlds are as they were.", 0, $exception);
    }

    /** @param list<string> $folders */
    private function takeUnlocked(Server $server, string $name, array $folders, string $kind, ?int $userId, Closure $progress): Snapshot
    {
        if ($folders === []) {
            throw new InvalidArgumentException('There is no world to keep yet: the server creates it the first time it starts.');
        }

        $uuid = (string) Str::uuid();
        $version = $this->world->info($server, $folders[0])['version'] ?? null;
        $state = $this->console->state($server);
        if (! in_array($state, ['running', 'offline'], true)) {
            throw new InvalidArgumentException($state === null ? 'Wings did not say whether the server runs.' : "The server is {$state}: take the snapshot once it is running or stopped.");
        }

        $running = $state === 'running';
        if ($running) {
            // No autosave while the folders are read, and everything on disk first.
            $progress(10, 'Saving the world…');
            $this->console->send($server, ['save-off']);
            if ($this->console->sendAndWait($server, 'save-all flush', self::SAVED, 120.0) === null) {
                $this->saveOn($server);
                throw new RuntimeException('The server did not confirm saving the world.');
            }
        }

        try {
            $progress(30, 'Archiving '.implode(', ', $folders).'…');
            $size = $this->archives->archive($server, $folders, Snapshot::FOLDER, "{$uuid}.tar.gz");
        } finally {
            if ($running) {
                $this->saveOn($server);
            }
        }

        $snapshot = Snapshot::query()->create([
            'uuid' => $uuid,
            'server_id' => $server->id,
            'name' => mb_substr($name, 0, 100),
            'worlds' => $folders,
            'size' => $size,
            'version' => $version,
            'automatic' => $kind !== Snapshot::MANUAL,
            'kind' => $kind,
            'created_by' => $userId,
        ]);
        $progress(95, 'Snapshot recorded.');

        return $snapshot;
    }

    /** Turns autosaving back on; a failure must not hide the snapshot's own result. */
    private function saveOn(Server $server): void
    {
        try {
            $this->console->send($server, ['save-on']);
        } catch (Throwable) {
            // The server stopped meanwhile: it saves normally at its next start.
        }
    }

    private function deleteUnlocked(Server $server, Snapshot $snapshot): void
    {
        try {
            $this->archives->delete($server, Snapshot::FOLDER, [$snapshot->file()]);
        } catch (DaemonConnectionException $exception) {
            // An archive already gone is no reason to keep its record.
            if ($exception->getStatusCode() !== 404) {
                throw $exception;
            }
        }
        $snapshot->delete();
    }

    /**
     * Keeps the newest snapshots of a kind: scheduled ones as the server's schedule says, those taken
     * before a restore as the panel's setting says; never `$except` (one just restored). A failure is
     * reported, not thrown: the snapshot or restore itself succeeded.
     */
    private function pruneQuietly(Server $server, string $kind, ?int $except = null): void
    {
        if ($kind === Snapshot::MANUAL) {
            return;
        }

        try {
            $default = (int) Extensions::settings(MinecraftProvider::ID)->get('automatic_keep', 5);
            $keep = $kind === Snapshot::SCHEDULED ? (SnapshotSchedule::query()->find($server->id)?->keep ?? $default) : $default;
            $old = Snapshot::query()->where('server_id', $server->id)->where('kind', $kind)
                ->orderByDesc('created_at')->orderByDesc('id')->skip(max(1, $keep))->take(100)->get()
                ->reject(fn (Snapshot $snapshot): bool => $snapshot->id === $except);
            foreach ($old as $snapshot) {
                $this->deleteUnlocked($server, $snapshot);
            }
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /**
     * Worlds' folders with their dimensions' (world_nether, world_the_end) that exist.
     *
     * @param  list<string>  $worlds
     * @return list<string>
     */
    private function expand(Server $server, array $worlds): array
    {
        $folders = [];
        foreach ($worlds as $world) {
            array_push($folders, ...$this->worlds->folders($server, $world));
        }

        return array_values(array_unique($folders));
    }

    /**
     * The folders in the server's root. A listing that fails throws: a restore must not take a folder
     * for missing because Wings did not answer.
     *
     * @return list<string>
     */
    private function folderNames(Server $server): array
    {
        $names = [];
        foreach ($this->files->listOrFail($server, '/') as $entry) {
            if (($entry['file'] ?? true) === false) {
                $names[] = (string) ($entry['name'] ?? '');
            }
        }

        return $names;
    }

    /**
     * Stops the server and waits until Wings says it is offline in a reading taken after the stop,
     * past the state's cache; kills it if it takes too long.
     */
    private function stop(Server $server): void
    {
        foreach (['stop' => self::STOP_SECONDS, 'kill' => 40] as $signal => $seconds) {
            try {
                $this->power->send($server, $signal);
            } catch (Throwable) {
                // Already stopped: Wings may refuse the signal.
            }

            $sent = time();
            while (time() < $sent + $seconds) {
                sleep(2);
                if (time() - $sent >= self::$stateCacheSeconds && $this->console->state($server) === 'offline') {
                    return;
                }
            }
        }

        throw new RuntimeException('The server did not stop.');
    }

    /** One snapshot, restore or deletion at a time per server. */
    private function locked(Server $server, Closure $work): mixed
    {
        $lock = Cache::lock('minecraft:worlds:'.$server->uuid, 2 * 3600);
        if (! $lock->get()) {
            throw new InvalidArgumentException('A snapshot or restore of this server is running. Try again when it ends.');
        }

        try {
            return $work();
        } finally {
            $lock->release();
        }
    }
}
