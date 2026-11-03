<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OlivierDutoit\GitDeploy\Forges\Webhook;
use OlivierDutoit\GitDeploy\Http\RepositoryService;
use OlivierDutoit\GitDeploy\Models\Repository;

/** The URL forges call on every push. Public: the secret, as a signature or a token, is what lets a call in. */
final class HookController
{
    public function __construct(private readonly RepositoryService $service) {}

    public function __invoke(Request $request, string $repository): JsonResponse
    {
        $model = Repository::query()->with('server')->where('uuid', $repository)->first();
        $secret = $model?->secret('webhook_secret');
        $hook = $secret !== null ? Webhook::from($request, $secret) : null;
        if ($model === null || $hook === null) {
            // The same answer for an unknown repository and a wrong secret.
            return new JsonResponse(['message' => 'Unknown repository or wrong secret.'], 403);
        }

        if ($hook->event === 'ping') {
            return new JsonResponse(['message' => 'Git Deploy is listening.']);
        }
        if ($hook->event !== 'push') {
            return new JsonResponse(['message' => 'Ignored: not a push to a branch.'], 202);
        }
        if ($hook->branch !== null && $hook->branch !== $model->branch) {
            return new JsonResponse(['message' => "Ignored: a push to {$hook->branch}, the server deploys {$model->branch}."], 202);
        }
        if (! $model->auto_deploy) {
            return new JsonResponse(['message' => 'Ignored: deploying on push is turned off for this server.'], 202);
        }
        if ($model->server->isSuspended()) {
            return new JsonResponse(['message' => 'Ignored: the server is suspended.'], 202);
        }

        $deployment = $this->service->deploy($model, 'push', null, $hook->sha, $hook->message, $hook->author);

        return new JsonResponse(['message' => 'Deploy queued.', 'deployment' => $deployment->uuid], 202);
    }
}
