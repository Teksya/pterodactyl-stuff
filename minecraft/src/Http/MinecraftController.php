<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Http;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use OlivierDutoit\Minecraft\Players\Actions;
use OlivierDutoit\Minecraft\Players\Commands;
use OlivierDutoit\Minecraft\Players\Lists;
use OlivierDutoit\Minecraft\Players\Players;
use OlivierDutoit\Minecraft\Players\World;
use OlivierDutoit\Minecraft\Server\MinecraftServer;
use OlivierDutoit\Minecraft\Server\ServerRcon;
use Pterodactyl\Contracts\Files\WritesFileContents;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use RuntimeException;

/**
 * A Minecraft server's players and world. Seeing them takes `ext.minecraft.read`; acting on them, on
 * the lists and on the world `ext.minecraft.manage`. The server icon takes `file.update`.
 */
final class MinecraftController
{
    public function __construct(
        private readonly Players $players,
        private readonly Actions $actions,
        private readonly Lists $lists,
        private readonly World $world,
        private readonly ServerRcon $rcon,
        private readonly MinecraftServer $files,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(function () use ($server): array {
            $status = $this->players->status($server);
            $properties = $this->files->properties($server);

            return [
                'running' => $status['running'],
                'online' => $status['online'],
                'max' => $status['max'],
                'joined' => count(array_filter($this->players->all($server), fn (array $player): bool => $player['lastSeen'] !== null)),
                'version' => $status['version'],
                'motd' => $properties->get('motd', 'A Minecraft Server'),
                'world' => $this->files->world($server),
                'rcon' => $this->rcon->status($server),
            ];
        });
    }

    /** Turns RCON on, on one of the server's allocation ports; the server needs a restart for it. */
    public function enableRcon(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.manage', 'file.update']);
        $port = (int) $request->validate(['port' => ['required', 'integer', 'between:1,65535']])['port'];

        return $this->answer(function () use ($server, $port): array {
            $this->rcon->enable($server, $port);
            Activity::event('server:minecraft.rcon.enable')->property('port', $port)->log();

            return $this->rcon->status($server);
        });
    }

    public function players(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(fn (): array => ['players' => $this->players->all($server)]);
    }

    public function player(Request $request): JsonResponse
    {
        $uuid = $this->routeUuid($request);
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(fn (): array => $this->players->profile($server, strtolower($uuid)));
    }

    public function playerAction(Request $request): JsonResponse
    {
        $uuid = $this->routeUuid($request);
        $server = $this->authorize($request, ['ext.minecraft.manage']);
        $action = (string) $request->validate(['action' => ['required', 'string', 'in:'.implode(',', [...Commands::PLAYER_ACTIONS, 'op_level'])]])['action'];

        return $this->answer(function () use ($server, $request, $uuid, $action): array {
            $result = $this->actions->player($server, strtolower($uuid), $action, $request->except('action'));
            Activity::event('server:minecraft.player.'.$action)->property(['player' => strtolower($uuid), 'command' => $result['command']])->log();

            return $result;
        });
    }

    public function add(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.manage']);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:17'],
            'list' => ['required', 'string', 'in:whitelist,ops,banned-players'],
            'reason' => ['nullable', 'string', 'max:256'],
        ]);

        return $this->answer(function () use ($server, $input): array {
            $result = $this->actions->add($server, $input['name'], $input['list'], $input['reason'] ?? null);
            Activity::event('server:minecraft.list.add')->property(['player' => $input['name'], 'list' => $input['list']])->log();

            return $result;
        });
    }

    public function ipBans(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(fn (): array => ['bans' => $this->lists->read($server, 'banned-ips')]);
    }

    public function ipBan(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.manage']);
        $input = $request->validate(['ip' => ['required', 'ip'], 'add' => ['required', 'boolean'], 'reason' => ['nullable', 'string', 'max:256']]);

        return $this->answer(function () use ($server, $input): array {
            $result = $this->actions->banIp($server, $input['ip'], (bool) $input['add'], $input['reason'] ?? null);
            Activity::event($input['add'] ? 'server:minecraft.ip.ban' : 'server:minecraft.ip.pardon')->property('ip', $input['ip'])->log();

            return $result;
        });
    }

    public function broadcast(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.manage']);

        return $this->answer(function () use ($server, $request): array {
            $result = $this->actions->console($server, Commands::world('say', ['text' => $request->input('text')]));
            Activity::event('server:minecraft.world.say')->property('command', $result['command'])->log();

            return $result;
        });
    }

    public function world(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.read']);

        return $this->answer(fn (): array => $this->world->info($server));
    }

    public function worldAction(Request $request): JsonResponse
    {
        $server = $this->authorize($request, ['ext.minecraft.manage']);
        $action = (string) $request->validate(['action' => ['required', 'string', 'in:'.implode(',', Commands::WORLD_ACTIONS)]])['action'];

        return $this->answer(function () use ($server, $request, $action): array {
            $result = $this->actions->console($server, Commands::world($action, $request->except('action')));
            Activity::event('server:minecraft.world.'.$action)->property('command', $result['command'])->log();

            return $result;
        });
    }

    /** server-icon.png: any picture, cropped square and scaled to the 64 × 64 the game shows. */
    public function icon(Request $request, WritesFileContents $writer): Response
    {
        $server = $this->authorize($request, ['file.update']);
        $request->validate(['icon' => ['required', 'file', 'image', 'max:4096']]);
        abort_unless(function_exists('imagecreatefromstring'), 422, 'The panel\'s PHP has no GD extension to resize the picture.');

        // A small file can declare a huge picture, which decoding would need gigabytes for.
        $path = $request->file('icon')->getRealPath();
        $size = @getimagesize($path);
        abort_if($size === false || $size[0] > 4096 || $size[1] > 4096, 422, 'Use a picture of at most 4096 × 4096 pixels.');

        $source = @imagecreatefromstring((string) file_get_contents($path));
        abort_if($source === false, 422, 'That picture could not be read.');

        $side = min(imagesx($source), imagesy($source));
        $icon = imagecreatetruecolor(64, 64);
        imagealphablending($icon, false);
        imagesavealpha($icon, true);
        imagefill($icon, 0, 0, imagecolorallocatealpha($icon, 0, 0, 0, 127));
        imagecopyresampled($icon, $source, 0, 0, intdiv(imagesx($source) - $side, 2), intdiv(imagesy($source) - $side, 2), 64, 64, $side, $side);

        ob_start();
        imagepng($icon);
        $png = (string) ob_get_clean();

        try {
            $writer->write($server, 'server-icon.png', $png);
        } catch (DaemonConnectionException $exception) {
            throw new DisplayException('Wings could not save server-icon.png: '.$exception->getMessage());
        }
        Activity::event('server:minecraft.icon')->log();

        return response()->noContent();
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

    /** Runs `$work`, turning what Wings and the checks report into messages for the user. */
    private function answer(Closure $work): JsonResponse
    {
        try {
            $data = $work();
        } catch (InvalidArgumentException $exception) {
            throw ValidationException::withMessages(['input' => $exception->getMessage()]);
        } catch (DaemonConnectionException $exception) {
            throw new DisplayException('Wings could not reach the server\'s files or console: '.$exception->getMessage());
        } catch (RuntimeException $exception) {
            // Reading a binary file through Wings' download endpoint.
            throw new DisplayException($exception->getMessage());
        }

        // Item names from mods and plugins are not always valid UTF-8.
        return new JsonResponse($data, 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
    }
}
