<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Http\Controllers;

use Illuminate\Http\JsonResponse;
use OlivierDutoit\GitDeploy\Forges\GenericGit;
use OlivierDutoit\GitDeploy\Http\RepositoryService;
use OlivierDutoit\GitDeploy\Models\Repository;

/** Root administrators: every server deploying from a repository. The admin API stack only lets them in. */
final class AdminDeployController
{
    public function __construct(private readonly RepositoryService $service) {}

    public function index(): JsonResponse
    {
        $repositories = Repository::query()->with('server:id,name,uuidShort,uuid')->orderByDesc('updated_at')->limit(1000)->get();

        return new JsonResponse([
            'data' => $repositories->map(fn (Repository $repository): array => [
                ...$this->service->present($repository, false),
                'server' => ['id' => $repository->server->id, 'name' => $repository->server->name, 'identifier' => $repository->server->uuidShort, 'uuid' => $repository->server->uuid],
            ])->all(),
            'meta' => ['git_available' => GenericGit::available()],
        ]);
    }
}
