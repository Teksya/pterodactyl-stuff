<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use OlivierDutoit\Webhooks\Http\EndpointService;
use OlivierDutoit\Webhooks\Http\Owner;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Monitor\WingsDelay;
use OlivierDutoit\Webhooks\Scope;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * Root administrators: the panel's own endpoints, and every server's and account's, which they
 * can inspect, fix, turn off or remove. The admin API stack only lets root administrators in.
 */
final class AdminWebhooksController
{
    public function __construct(private readonly EndpointService $service) {}

    public function meta(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => [
            ...$this->service->meta($this->owner($request)),
            'can_manage' => true,
            'can_read_payloads' => true,
            'wings_delays' => WingsDelay::slowNodes(),
        ]]);
    }

    /** The endpoints of the route's owner: the panel's, `/servers/{serverId}` or `/users/{userId}`. */
    public function index(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->list($this->owner($request)->endpoints())]);
    }

    /** Every server's or account's endpoints, for the overview. */
    public function all(Request $request): JsonResponse
    {
        $scope = Scope::tryFrom((string) $request->query('scope', 'server')) ?? Scope::Server;

        return new JsonResponse(['data' => $this->service->list(Endpoint::query()->where('scope', $scope->value))]);
    }

    public function store(Request $request): JsonResponse
    {
        $endpoint = $this->service->save($this->owner($request), $request, $this->actor($request), privileged: true);

        return new JsonResponse(['data' => $this->service->present($endpoint)], Response::HTTP_CREATED);
    }

    public function update(Request $request, int $endpoint): JsonResponse
    {
        $model = Endpoint::query()->findOrFail($endpoint);
        $saved = $this->service->save(Owner::of($model), $request, $this->actor($request), $model, privileged: true);

        return new JsonResponse(['data' => $this->service->present($saved)]);
    }

    public function destroy(int $endpoint): Response
    {
        $model = Endpoint::query()->findOrFail($endpoint);
        $this->service->delete(Owner::of($model), $model);

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    public function test(Request $request, int $endpoint): JsonResponse
    {
        $delivery = $this->service->test(Endpoint::query()->findOrFail($endpoint), $this->actor($request));

        return new JsonResponse(['data' => $delivery->toPanelArray(true)]);
    }

    public function deliveries(Request $request, int $endpoint): JsonResponse
    {
        $model = Endpoint::query()->findOrFail($endpoint);

        return new JsonResponse($this->service->paginated($this->service->deliveries(Delivery::query()->where('endpoint_id', $model->id), $request)));
    }

    /** The delivery log of every endpoint, newest first. */
    public function log(Request $request): JsonResponse
    {
        $page = $this->service->deliveries(Delivery::query()->with('endpoint:id,name,scope,provider'), $request);

        return new JsonResponse($this->service->paginated($page, fn (Delivery $delivery): array => [
            'endpoint' => ['id' => $delivery->endpoint->id, 'name' => $delivery->endpoint->name, 'scope' => $delivery->endpoint->scope->value, 'provider' => $delivery->endpoint->provider],
        ]));
    }

    public function delivery(int $delivery): JsonResponse
    {
        return new JsonResponse(['data' => Delivery::query()->findOrFail($delivery)->toPanelArray(true)]);
    }

    public function redeliver(int $delivery): JsonResponse
    {
        $model = Delivery::query()->with('endpoint')->findOrFail($delivery);

        return new JsonResponse(['data' => $this->service->redeliver($model)->toPanelArray(true)]);
    }

    /** Nodes and servers, for the editor's filters. */
    public function targets(): JsonResponse
    {
        return new JsonResponse(['data' => [
            'nodes' => Node::query()->orderBy('name')->get(['id', 'name'])->map(fn (Node $node): array => ['id' => $node->id, 'name' => $node->name])->all(),
            'servers' => Server::query()->orderBy('name')->limit(5000)->get(['id', 'name', 'uuidShort', 'node_id'])
                ->map(fn (Server $server): array => ['id' => $server->id, 'name' => $server->name, 'identifier' => $server->uuidShort, 'node_id' => $server->node_id])
                ->all(),
        ]]);
    }

    private function owner(Request $request): Owner
    {
        $serverId = $request->route('serverId');
        if ($serverId !== null) {
            return Owner::server(Server::query()->findOrFail((int) $serverId));
        }

        $userId = $request->route('userId');
        if ($userId !== null) {
            return Owner::account(User::query()->findOrFail((int) $userId));
        }

        return Owner::admin();
    }

    private function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }
}
