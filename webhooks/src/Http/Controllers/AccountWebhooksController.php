<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Http\Controllers;

use Illuminate\Http\Request;
use OlivierDutoit\Webhooks\Http\Owner;

/** The signed-in user's own endpoints, for the events of their account. */
final class AccountWebhooksController extends EndpointsController
{
    protected function owner(Request $request): Owner
    {
        return Owner::account($this->actor($request));
    }
}
