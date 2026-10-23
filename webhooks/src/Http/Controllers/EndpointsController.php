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
use Pterodactyl\Models\User;
use Throwable;

/**
 * The endpoints of one owner (a server, an account) and their deliveries. Route parameters
 * are read from the request, so the same actions serve routes with and without {server}.
 */
abstract class EndpointsController
{
    public function __construct(protected readonly EndpointService $service) {}

    /** The owner of the endpoints on this route, once the user may see them. */
    abstract protected function owner(Request $request): Owner;

    /** Refuse users who may only look. */
    protected function authorizeManage(Request $request, Owner $owner): void {}

    /** Refuse users who may list deliveries but not read what they carried. */
    protected function authorizePayloads(Request $request, Owner $owner): void {}

    public function meta(Request $request): JsonResponse
    {
        $owner = $this->owner($request);

        return new JsonResponse(['data' => [
            ...$this->service->meta($owner),
            'can_manage' => $this->allowed(fn () => $this->authorizeManage($request, $owner)),
            'can_read_payloads' => $this->allowed(fn () => $this->authorizePayloads($request, $owner)),
        ]]);
    }

    public function index(Request $request): JsonResponse
    {
        return new JsonResponse(['data' => $this->service->list($this->owner($request)->endpoints())]);
    }

    public function store(Request $request): JsonResponse
    {
        $owner = $this->owner($request);
        $this->authorizeManage($request, $owner);
        $endpoint = $this->service->save($owner, $request, $this->actor($request));

        return new JsonResponse(['data' => $this->service->present($endpoint)], Response::HTTP_CREATED);
    }

    public function update(Request $request): JsonResponse
    {
        $owner = $this->owner($request);
        $this->authorizeManage($request, $owner);
        $endpoint = $this->service->save($owner, $request, $this->actor($request), $this->find($owner, $request));

        return new JsonResponse(['data' => $this->service->present($endpoint)]);
    }

    public function destroy(Request $request): Response
    {
        $owner = $this->owner($request);
        $this->authorizeManage($request, $owner);
        $this->service->delete($owner, $this->find($owner, $request));

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    public function test(Request $request): JsonResponse
    {
        $owner = $this->owner($request);
        $this->authorizeManage($request, $owner);
        $delivery = $this->service->test($this->find($owner, $request), $this->actor($request));

        return new JsonResponse(['data' => $delivery->toPanelArray(true)]);
    }

    public function deliveries(Request $request): JsonResponse
    {
        $endpoint = $this->find($this->owner($request), $request);
        $page = $this->service->deliveries(Delivery::query()->where('endpoint_id', $endpoint->id), $request);

        return new JsonResponse($this->service->paginated($page));
    }

    public function delivery(Request $request): JsonResponse
    {
        $owner = $this->owner($request);
        $this->authorizePayloads($request, $owner);

        return new JsonResponse(['data' => $this->findDelivery($owner, $request)->toPanelArray(true)]);
    }

    public function redeliver(Request $request): JsonResponse
    {
        $owner = $this->owner($request);
        $this->authorizeManage($request, $owner);
        $delivery = $this->service->redeliver($this->findDelivery($owner, $request));

        return new JsonResponse(['data' => $delivery->toPanelArray(true)]);
    }

    /** Whether an authorize…() check passes. */
    private function allowed(callable $check): bool
    {
        try {
            $check();

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    protected function actor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    protected function find(Owner $owner, Request $request): Endpoint
    {
        return $owner->endpoints()->findOrFail((int) $request->route('endpoint'));
    }

    protected function findDelivery(Owner $owner, Request $request): Delivery
    {
        return Delivery::query()
            ->with('endpoint')
            ->whereIn('endpoint_id', $owner->endpoints()->select('id'))
            ->findOrFail((int) $request->route('delivery'));
    }
}
