<?php

declare(strict_types=1);

namespace OlivierDutoit\ServerOrganizer\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * What the dashboard groups servers by and the client API does not return: the node's id,
 * its location and the egg. The same servers the client API lists for `type`, so the cards
 * and these line up.
 */
final class ServersController
{
    /** More than this, the dashboard keeps the panel's paginated list. */
    public const int LIMIT = 2000;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $type = $request->query('type');
        $query = Server::query()->with(['node:id,name,location_id', 'node.location:id,short,long', 'egg:id,name']);
        $accessible = fn () => $user->accessibleServers()->pluck('servers.id')->all();

        if ($type === 'admin' || $type === 'admin-all') {
            abort_unless($user->root_admin, 403);
            if ($type === 'admin') {
                $query->whereNotIn('id', $accessible());
            }
        } else {
            $query->whereIn('id', $accessible());
        }

        $servers = $query->limit(self::LIMIT + 1)->get(['id', 'uuid', 'node_id', 'egg_id']);

        return new JsonResponse([
            'data' => $servers->take(self::LIMIT)->map(fn (Server $server): array => [
                'uuid' => $server->uuid,
                'node_id' => (int) $server->node_id,
                'node' => (string) $server->node?->name,
                'location_id' => $server->node?->location !== null ? (int) $server->node->location->id : null,
                'location' => $server->node?->location?->short,
                'location_description' => $server->node?->location?->long,
                'egg_id' => $server->egg_id !== null ? (int) $server->egg_id : null,
                'egg' => $server->egg?->name,
            ])->values()->all(),
            'meta' => ['truncated' => $servers->count() > self::LIMIT, 'limit' => self::LIMIT],
        ]);
    }
}
