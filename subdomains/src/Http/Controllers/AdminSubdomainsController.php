<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use OlivierDutoit\Subdomains\Dns\DnsException;
use OlivierDutoit\Subdomains\Dns\DnsProvider;
use OlivierDutoit\Subdomains\Http\SubdomainService;
use OlivierDutoit\Subdomains\Models\Subdomain;
use OlivierDutoit\Subdomains\Settings;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** Root administrators: every server's subdomains, and the check of the Cloudflare token. The admin API stack only lets them in. */
final class AdminSubdomainsController
{
    public function __construct(private readonly SubdomainService $service) {}

    /** Every subdomain of every server. */
    public function all(): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->list(Subdomain::query(), withServer: true)]);
    }

    /** Whether the token works and reaches each offered domain's zone. */
    public function check(DnsProvider $dns): JsonResponse
    {
        try {
            $zones = $dns->zones();
        } catch (DnsException $exception) {
            return new JsonResponse(['data' => ['ok' => false, 'error' => $exception->getMessage(), 'zones' => [], 'domains' => []]]);
        }

        $domains = array_map(function (string $domain) use ($dns): array {
            try {
                $dns->zoneFor($domain);

                return ['domain' => $domain, 'ok' => true, 'error' => null];
            } catch (DnsException $exception) {
                return ['domain' => $domain, 'ok' => false, 'error' => $exception->getMessage()];
            }
        }, Settings::domains());

        return new JsonResponse(['data' => [
            'ok' => ! in_array(false, array_column($domains, 'ok'), true),
            'error' => null,
            'zones' => $zones,
            'domains' => $domains,
        ]]);
    }

    public function meta(int $serverId): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->meta(Server::query()->findOrFail($serverId), true, true)]);
    }

    public function index(int $serverId): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->list(Subdomain::query()->where('server_id', $serverId))]);
    }

    public function available(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->available(strtolower(trim((string) $request->query('name'))), strtolower(trim((string) $request->query('domain'))))]);
    }

    public function store(Request $request, int $serverId): JsonResponse
    {
        $subdomain = $this->service->create(Server::query()->findOrFail($serverId), $request, $this->actor($request), privileged: true);

        return new JsonResponse(['data' => $this->service->present($subdomain)], Response::HTTP_CREATED);
    }

    public function update(Request $request, int $subdomain): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->present($this->service->update(Subdomain::query()->findOrFail($subdomain), $request, privileged: true), withServer: true)]);
    }

    public function destroy(int $subdomain): Response
    {
        $this->service->delete(Subdomain::query()->findOrFail($subdomain), privileged: true);

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    public function sync(int $subdomain): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->present($this->service->resync(Subdomain::query()->findOrFail($subdomain)), withServer: true)]);
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
