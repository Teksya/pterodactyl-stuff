<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use OlivierDutoit\Subdomains\Http\SubdomainService;
use OlivierDutoit\Subdomains\Models\Subdomain;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** A server's subdomains: seeing them takes `ext.subdomains.read`, changing them `ext.subdomains.manage`. */
final class ServerSubdomainsController
{
    public function __construct(private readonly SubdomainService $service) {}

    public function meta(Request $request): JsonResponse
    {
        $server = $this->server($request, 'read');

        return new JsonResponse(['data' => $this->service->meta($server, false, $this->actor($request)->can('ext.subdomains.manage', $server))]);
    }

    public function index(Request $request): JsonResponse
    {
        $server = $this->server($request, 'read');

        return new JsonResponse(['data' => $this->service->list(Subdomain::query()->where('server_id', $server->id))]);
    }

    public function available(Request $request): JsonResponse
    {
        $this->server($request, 'manage');

        return new JsonResponse(['data' => $this->service->available(strtolower(trim((string) $request->query('name'))), strtolower(trim((string) $request->query('domain'))))]);
    }

    public function store(Request $request): JsonResponse
    {
        $server = $this->server($request, 'manage');
        $subdomain = $this->service->create($server, $request, $this->actor($request), privileged: false);

        return new JsonResponse(['data' => $this->service->present($subdomain)], Response::HTTP_CREATED);
    }

    public function update(Request $request): JsonResponse
    {
        $model = $this->subdomain($request);

        return new JsonResponse(['data' => $this->service->present($this->service->update($model, $request, privileged: false))]);
    }

    public function destroy(Request $request): Response
    {
        $this->service->delete($this->subdomain($request), privileged: false);

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    public function sync(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->present($this->service->resync($this->subdomain($request)))]);
    }

    /**
     * The route's {subdomain}, read from the route: as a method parameter it would receive the
     * {server} model, which the panel binds first.
     */
    private function subdomain(Request $request): Subdomain
    {
        $server = $this->server($request, 'manage');
        $subdomain = Subdomain::query()->where('server_id', $server->id)->findOrFail((int) $request->route('subdomain'));
        $subdomain->setRelation('server', $server);

        return $subdomain;
    }

    private function server(Request $request, string $permission): Server
    {
        $server = $request->route('server');
        abort_unless($server instanceof Server, 404);

        if (! $this->actor($request)->can('ext.subdomains.'.$permission, $server)) {
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
}
