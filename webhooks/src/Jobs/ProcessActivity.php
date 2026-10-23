<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use Pterodactyl\Models\ActivityLog;

/**
 * Turns an activity log entry into deliveries, off the request that logged it. Queued once
 * the entry's transaction commits, when its subjects (the server, the user) are written.
 */
final class ProcessActivity implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    /** Once: a retry after some deliveries were queued would queue them twice. */
    public int $tries = 1;

    public function __construct(public readonly int $activityId) {}

    public function handle(EventBuilder $builder, Dispatcher $dispatcher): void
    {
        $log = ActivityLog::query()->with(['subjects.subject', 'actor'])->find($this->activityId);
        if (! $log instanceof ActivityLog) {
            return;
        }

        $event = $builder->fromActivity($log);
        if ($event !== null) {
            $dispatcher->dispatch($event);
        }
    }
}
