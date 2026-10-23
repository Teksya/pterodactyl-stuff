<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks;

/** Who an endpoint belongs to, and so which events it may receive. */
enum Scope: string
{
    /** Root administrators: every event of the panel. */
    case Admin = 'admin';

    /** A server's owner and subusers: the events of that server. */
    case Server = 'server';

    /** A user: the events of their own account. */
    case Account = 'account';
}
