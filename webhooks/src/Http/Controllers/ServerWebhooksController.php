<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Http\Controllers;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use OlivierDutoit\Webhooks\Http\Owner;
use Pterodactyl\Models\Server;

/**
 * A server's endpoints. Seeing them and their delivery log takes `ext.webhooks.read`; reading
 * a delivery's payload takes the panel's `activity.read` as well, and changing them
 * `ext.webhooks.manage` with `activity.read`, since an endpoint receives the server's activity
 * (console commands included).
 */
final class ServerWebhooksController extends EndpointsController
{
    protected function owner(Request $request): Owner
    {
        $server = $request->route('server');
        abort_unless($server instanceof Server, 404);

        if (! $this->actor($request)->can('ext.webhooks.read', $server)) {
            throw new AuthorizationException();
        }

        return Owner::server($server);
    }

    /** A payload is the server's activity (console commands, startup values): the panel's own permission for it. */
    protected function authorizePayloads(Request $request, Owner $owner): void
    {
        if (! $this->actor($request)->can('activity.read', $owner->server)) {
            throw new AuthorizationException();
        }
    }

    protected function authorizeManage(Request $request, Owner $owner): void
    {
        $user = $this->actor($request);
        if (! $user->can('ext.webhooks.manage', $owner->server) || ! $user->can('activity.read', $owner->server)) {
            throw new AuthorizationException();
        }
    }
}
