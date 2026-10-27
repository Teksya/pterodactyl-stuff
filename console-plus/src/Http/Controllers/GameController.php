<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OlivierDutoit\ConsolePlus\GameDocument;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** The route's server's game, for the console's command completion, for whoever may see its console. */
final class GameController
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $server = $request->route('server');
        abort_unless($user instanceof User, 401);
        abort_unless($server instanceof Server, 404);

        if (! $user->can('websocket.connect', $server)) {
            throw new AuthorizationException();
        }

        $variables = [];
        foreach ($server->resolvedVariables() as $variable) {
            /** @var EggVariable $variable */
            $variables[$variable->env_variable] = $variable->server_value ?? $variable->default_value;
        }

        return new JsonResponse(['data' => GameDocument::describe((string) $server->egg?->name, $server->tagSlugs(), $variables)]);
    }
}
