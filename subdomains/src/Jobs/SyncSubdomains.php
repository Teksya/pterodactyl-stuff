<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use OlivierDutoit\Subdomains\Models\Subdomain;
use OlivierDutoit\Subdomains\Records\Syncer;

/** Brings some subdomains' records up to date, after their server's allocation or egg changed. */
final class SyncSubdomains implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    /** @param  list<int>  $ids */
    public function __construct(public readonly array $ids) {}

    public function handle(Syncer $syncer): void
    {
        foreach (Subdomain::query()->with('server.allocation', 'server.allocations.node', 'server.egg')->whereIn('id', $this->ids)->get() as $subdomain) {
            $syncer->sync($subdomain);
        }
    }
}
