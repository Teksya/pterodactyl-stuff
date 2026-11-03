<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use OlivierDutoit\GitDeploy\Forges\ForgeException;
use OlivierDutoit\GitDeploy\Forges\Forges;
use OlivierDutoit\GitDeploy\Http\RepositoryService;
use OlivierDutoit\GitDeploy\Models\Deployment;
use OlivierDutoit\GitDeploy\Models\Repository;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

/**
 * A server's repository and deploys. Seeing them takes `ext.git-deploy.read`; deploying and
 * rolling back `ext.git-deploy.deploy`; changing the repository `ext.git-deploy.manage`, since it
 * decides what code the server runs. Every id is read from the route: as a method parameter it
 * would receive the {server} model, which the panel binds first.
 */
final class ServerDeployController
{
    public function __construct(private readonly RepositoryService $service) {}

    public function meta(Request $request): JsonResponse
    {
        $server = $this->server($request, 'read');
        $user = $this->actor($request);

        return new JsonResponse(['data' => $this->service->meta($server, $user->can('ext.git-deploy.deploy', $server), $user->can('ext.git-deploy.manage', $server))]);
    }

    public function save(Request $request): JsonResponse
    {
        $server = $this->server($request, 'manage');
        $repository = $this->service->save($server, $request, $this->actor($request));
        $this->log('server:git-deploy.repository', ['url' => $repository->url, 'branch' => $repository->branch]);

        return new JsonResponse(['data' => $this->service->present($repository, true)]);
    }

    public function destroy(Request $request): Response
    {
        $repository = $this->repository($request, 'manage');
        $repository->delete();
        $this->log('server:git-deploy.unlink', ['url' => $repository->url]);

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    public function key(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'manage');

        return new JsonResponse(['data' => ['ssh_public_key' => $this->service->generateKey($repository)]]);
    }

    public function secret(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'manage');
        $this->service->rotateSecret($repository);

        return new JsonResponse(['data' => $this->service->present($repository->refresh(), true)]);
    }

    /** The branch's last commits, to pick one to deploy; also tells whether the repository can be reached. */
    public function commits(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'deploy');

        try {
            $forge = Forges::for($repository);
            $commits = $forge->commits($repository->branch, 15);
            if ($commits === []) {
                $commits = [$forge->head($repository->branch)];
            }
        } catch (ForgeException $exception) {
            throw ValidationException::withMessages(['repository' => $exception->getMessage()]);
        } catch (Throwable $exception) {
            report($exception);
            throw ValidationException::withMessages(['repository' => 'The repository could not be read.']);
        }

        return new JsonResponse(['data' => array_map(fn ($commit): array => $commit->toArray(), $commits)]);
    }

    public function deploy(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'deploy');
        $data = $request->validate(['commit' => ['nullable', 'string', 'regex:/^[0-9a-f]{7,64}$/'], 'message' => ['nullable', 'string', 'max:500']]);
        $deployment = $this->service->deploy($repository, 'manual', $this->actor($request), $data['commit'] ?? null, $data['message'] ?? null);
        $this->log('server:git-deploy.deploy', ['branch' => $repository->branch, 'commit' => $data['commit'] ?? 'latest']);

        return new JsonResponse(['data' => $this->service->deployment($deployment->refresh(), $repository)], Response::HTTP_ACCEPTED);
    }

    public function deployments(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'read');
        $page = $repository->deployments()->with('creator:id,username')->orderByDesc('id')->paginate(15);

        return new JsonResponse([
            'data' => array_map(fn (Deployment $deployment): array => $this->service->deployment($deployment, $repository), $page->items()),
            'meta' => ['page' => $page->currentPage(), 'pages' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'read');
        $deployment = $repository->deployments()->findOrFail((int) $request->route('deployment'));

        return new JsonResponse(['data' => $this->service->deployment($deployment, $repository, withLog: true)]);
    }

    public function rollback(Request $request): JsonResponse
    {
        $repository = $this->repository($request, 'deploy');
        $target = $repository->deployments()->findOrFail((int) $request->route('deployment'));
        $deployment = $this->service->rollback($repository, $target, $this->actor($request));
        $this->log('server:git-deploy.rollback', ['release' => $target->release]);

        return new JsonResponse(['data' => $this->service->deployment($deployment->refresh(), $repository)], Response::HTTP_ACCEPTED);
    }

    private function repository(Request $request, string $permission): Repository
    {
        $server = $this->server($request, $permission);
        $repository = Repository::query()->where('server_id', $server->id)->firstOrFail();
        $repository->setRelation('server', $server);

        return $repository;
    }

    private function server(Request $request, string $permission): Server
    {
        $server = $request->route('server');
        abort_unless($server instanceof Server, 404);

        if (! $this->actor($request)->can('ext.git-deploy.'.$permission, $server)) {
            throw new AuthorizationException();
        }

        return $server;
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    /** @param  array<string, string>  $properties */
    private function log(string $event, array $properties): void
    {
        try {
            Activity::event($event)->property($properties)->log();
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
