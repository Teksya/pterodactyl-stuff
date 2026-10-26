<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Http;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Jobs\RestoreSnapshot;
use OlivierDutoit\Minecraft\Jobs\TakeSnapshot;
use OlivierDutoit\Minecraft\MinecraftProvider;
use OlivierDutoit\Minecraft\Models\Snapshot;
use OlivierDutoit\Minecraft\Models\SnapshotSchedule;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Worlds\Snapshots;
use OlivierDutoit\Minecraft\Worlds\Worlds;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use RuntimeException;
use Pterodactyl\Services\Extensions\ExtensionJobProgress;

/**
 * A server's worlds and their snapshots. Seeing them takes `ext.minecraft.read`; taking, restoring and
 * deleting snapshots, and switching, creating and deleting worlds, `ext.minecraft.worlds`.
 */
final class WorldsController
{
    public function __construct(
        private readonly Worlds $worlds,
        private readonly Snapshots $snapshots,
        private readonly MinecraftServer $files,
        private readonly ExtensionJobProgress $progress,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(function () use ($server): array {
            $archives = array_column($this->files->list($server, Snapshot::FOLDER), 'name');
            $schedule = SnapshotSchedule::query()->find($server->id);

            return [
                'active' => $this->files->world($server),
                'worlds' => $this->worlds->all($server),
                'snapshots' => Snapshot::query()->where('server_id', $server->id)->orderByDesc('created_at')->orderByDesc('id')->get()
                    ->map(fn (Snapshot $snapshot): array => [...$snapshot->payload(), 'missing' => ! in_array($snapshot->file(), $archives, true)])
                    ->all(),
                'schedule' => [
                    'interval_hours' => $schedule?->interval_hours ?? 0,
                    'keep' => $schedule?->keep ?? $this->automaticKeep(),
                    'last_run_at' => $schedule?->last_run_at?->toIso8601String(),
                ],
                'limits' => ['manual' => $this->maxManual()],
            ];
        });
    }

    public function activate(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.worlds']);
        $folder = (string) $request->validate(['folder' => ['required', 'string', 'max:64']])['folder'];

        return $this->answer(function () use ($server, $folder): array {
            $this->worlds->activate($server, $folder);
            Activity::event('server:minecraft.world.activate')->property('world', $folder)->log();

            return ['message' => "\"{$folder}\" loads at the next start."];
        });
    }

    public function create(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.worlds']);
        $input = $request->validate([
            'folder' => ['required', 'string', 'max:64'],
            'seed' => ['nullable', 'string', 'max:64'],
            'type' => ['nullable', 'string', 'max:64'],
        ]);

        return $this->answer(function () use ($server, $input): array {
            $this->worlds->create($server, $input['folder'], $input['seed'] ?? null, $input['type'] ?? null);
            Activity::event('server:minecraft.world.create')->property('world', $input['folder'])->log();

            return ['message' => "\"{$input['folder']}\" is created at the next start."];
        });
    }

    public function deleteWorld(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.worlds', 'file.delete']);
        $folder = (string) $request->validate(['folder' => ['required', 'string', 'max:64']])['folder'];

        return $this->answer(function () use ($server, $folder): array {
            $this->worlds->delete($server, $folder);
            Activity::event('server:minecraft.world.delete')->property('world', $folder)->log();

            return ['message' => "\"{$folder}\" deleted."];
        });
    }

    public function take(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.worlds']);
        $input = $request->validate([
            'name' => ['nullable', 'string', 'max:100'],
            'worlds' => ['nullable', 'array', 'max:10'],
            'worlds.*' => ['string', 'max:64'],
        ]);

        return $this->answer(function () use ($request, $server, $input): array {
            $manual = Snapshot::query()->where('server_id', $server->id)->where('automatic', false)->count();
            if ($manual >= $this->maxManual()) {
                throw new InvalidArgumentException("This server has {$manual} snapshots, the most allowed. Delete one first.");
            }
            foreach ($input['worlds'] ?? [] as $folder) {
                $this->worlds->find($server, $folder);
            }

            $user = $this->user($request);
            $job = $this->progress->begin(MinecraftProvider::ID, $user, $server, 'ext.minecraft.worlds');
            $name = trim((string) ($input['name'] ?? '')) ?: 'Snapshot, '.now()->format('Y-m-d H:i');
            TakeSnapshot::dispatch($server->id, $name, $input['worlds'] ?? null, Snapshot::MANUAL, $user->id, $job->id);
            Activity::event('server:minecraft.snapshot.take')->property('name', $name)->log();

            return ['job' => $job->id];
        });
    }

    public function restore(Request $request): JsonResponse
    {
        $uuid = $this->routeUuid($request);
        // A restore stops the server and starts it again.
        $server = $this->authorize($request, ['ext.minecraft.worlds', 'control.stop', 'control.start']);
        $safety = $request->boolean('safety', true);

        return $this->answer(function () use ($request, $server, $uuid, $safety): array {
            $snapshot = $this->find($server, $uuid);
            $job = $this->progress->begin(MinecraftProvider::ID, $this->user($request), $server, 'ext.minecraft.worlds');
            RestoreSnapshot::dispatch($snapshot->id, $safety, $job->id);
            Activity::event('server:minecraft.snapshot.restore')->property(['name' => $snapshot->name, 'safety' => $safety])->log();

            return ['job' => $job->id];
        });
    }

    public function destroy(Request $request): JsonResponse
    {
        $uuid = $this->routeUuid($request);
        $server = $this->authorize($request, ['ext.minecraft.worlds']);

        return $this->answer(function () use ($server, $uuid): array {
            $snapshot = $this->find($server, $uuid);
            $this->snapshots->delete($server, $snapshot);
            Activity::event('server:minecraft.snapshot.delete')->property('name', $snapshot->name)->log();

            return ['message' => "\"{$snapshot->name}\" deleted."];
        });
    }

    public function schedule(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.worlds']);
        $input = $request->validate([
            'interval_hours' => ['required', 'integer', 'in:0,1,3,6,12,24,48,168'],
            'keep' => ['required', 'integer', 'min:1', 'max:'.max(1, $this->maxManual())],
        ]);

        return $this->answer(function () use ($server, $input): array {
            if ((int) $input['interval_hours'] === 0) {
                SnapshotSchedule::query()->where('server_id', $server->id)->delete();
            } else {
                SnapshotSchedule::query()->updateOrCreate(['server_id' => $server->id], ['interval_hours' => (int) $input['interval_hours'], 'keep' => (int) $input['keep']]);
            }
            Activity::event('server:minecraft.snapshot.schedule')->property($input)->log();

            return ['message' => (int) $input['interval_hours'] === 0 ? 'Automatic snapshots are off.' : 'Automatic snapshots saved.'];
        });
    }

    private function find(Server $server, string $uuid): Snapshot
    {
        $snapshot = Snapshot::query()->where('server_id', $server->id)->where('uuid', $uuid)->first();
        if (! $snapshot instanceof Snapshot) {
            throw new InvalidArgumentException('This server has no such snapshot.');
        }

        return $snapshot;
    }

    private function maxManual(): int
    {
        return (int) Extensions::settings(MinecraftProvider::ID)->get('max_snapshots', 10);
    }

    private function automaticKeep(): int
    {
        return (int) Extensions::settings(MinecraftProvider::ID)->get('automatic_keep', 5);
    }

    /**
     * The {uuid} of the route. Laravel hands route parameters to a method by position, and {server}
     * comes first, so the name is read from the route instead.
     */
    private function routeUuid(Request $request): string
    {
        $uuid = $request->route('uuid');

        return is_string($uuid) ? strtolower($uuid) : '';
    }

    /** @param list<string> $permissions */
    private function authorize(Request $request, array $permissions): Server
    {
        $server = $request->route('server');
        $user = $request->user();
        abort_unless($server instanceof Server && $user instanceof User, 404);

        foreach ($permissions as $permission) {
            if (! $user->can($permission, $server)) {
                throw new AuthorizationException();
            }
        }

        return $server;
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    private function answer(Closure $work): JsonResponse
    {
        try {
            $data = $work();
        } catch (InvalidArgumentException $exception) {
            throw ValidationException::withMessages(['input' => $exception->getMessage()]);
        } catch (DaemonConnectionException $exception) {
            throw new DisplayException('Wings could not reach the server\'s files: '.$exception->getMessage());
        } catch (RuntimeException $exception) {
            // Reading a binary file through Wings' download endpoint.
            throw new DisplayException($exception->getMessage());
        }

        return new JsonResponse($data, 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
    }
}
