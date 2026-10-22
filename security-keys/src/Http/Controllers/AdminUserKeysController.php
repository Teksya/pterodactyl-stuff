<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use OlivierDutoit\SecurityKeys\Models\SecurityKey;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;

/**
 * An account's keys as root administrators see them, on the user's Security Keys tab: they can
 * remove a lost key, which is how an account whose only second factor was that key gets back in.
 */
final class AdminUserKeysController
{
    public function index(int $account): JsonResponse
    {
        $owner = User::query()->findOrFail($account);
        $keys = SecurityKey::query()->where('user_id', $owner->id)->oldest()->get();

        return new JsonResponse(['data' => $keys->map(fn (SecurityKey $key): array => $key->toPanelArray())->all()]);
    }

    public function destroy(int $account, int $key): Response
    {
        $owner = User::query()->findOrFail($account);
        $model = SecurityKey::query()->where('user_id', $owner->id)->findOrFail($key);
        $model->delete();

        Activity::event('user:security-key.delete')->subject($owner)->property('name', $model->name)->log();

        return new Response('', Response::HTTP_NO_CONTENT);
    }
}
