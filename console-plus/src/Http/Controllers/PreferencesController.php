<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OlivierDutoit\ConsolePlus\Models\Preferences;
use OlivierDutoit\ConsolePlus\PreferencesDocument;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** The signed-in user's console preferences for the route's server, for whoever may see its console. */
final class PreferencesController
{
    public function show(Request $request): JsonResponse
    {
        [$user, $server] = $this->authorize($request);
        $stored = Preferences::query()->where('user_id', $user->id)->where('server_id', $server->id)->first()?->preferences;

        return new JsonResponse(['data' => PreferencesDocument::normalize(is_array($stored) ? $stored : [], lenient: true)]);
    }

    public function update(Request $request): JsonResponse
    {
        [$user, $server] = $this->authorize($request);
        $preferences = PreferencesDocument::normalize($request->json()->all());

        Preferences::query()->updateOrCreate(['user_id' => $user->id, 'server_id' => $server->id], ['preferences' => $preferences]);

        return new JsonResponse(['data' => $preferences]);
    }

    /** @return array{0: User, 1: Server} */
    private function authorize(Request $request): array
    {
        $user = $request->user();
        $server = $request->route('server');
        abort_unless($user instanceof User, 401);
        abort_unless($server instanceof Server, 404);

        // The console's own permission: these preferences are about it, and its history holds its commands.
        if (! $user->can('websocket.connect', $server)) {
            throw new AuthorizationException();
        }

        return [$user, $server];
    }
}
