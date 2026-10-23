<?php

declare(strict_types=1);

namespace OlivierDutoit\ServerOrganizer\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OlivierDutoit\ServerOrganizer\LayoutDocument;
use OlivierDutoit\ServerOrganizer\Models\Layout;
use Pterodactyl\Models\User;

/** The signed-in user's dashboard layout: folders, placements, order and view choices. */
final class LayoutController
{
    public function show(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $stored = Layout::query()->where('user_id', $user->id)->first()?->layout;

        // A layout saved while the user was a root admin may ask for views they lost: read it leniently.
        return new JsonResponse(['data' => LayoutDocument::normalize(is_array($stored) ? $stored : [], (bool) $user->root_admin, lenient: true)]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $layout = LayoutDocument::normalize($request->json()->all(), (bool) $user->root_admin);

        Layout::query()->updateOrCreate(['user_id' => $user->id], ['layout' => $layout]);

        return new JsonResponse(['data' => $layout]);
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
