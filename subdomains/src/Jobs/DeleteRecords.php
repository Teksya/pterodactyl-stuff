<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use OlivierDutoit\Subdomains\Records\Syncer;

/**
 * Removes records whose subdomain is gone: its server was deleted, or the provider failed
 * while the subdomain was being deleted. Carries the records themselves, not the subdomain.
 */
final class DeleteRecords implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 6;

    /** @param  list<array{zone: string, id: string}>  $records */
    public function __construct(public readonly array $records) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900, 3600, 3600];
    }

    public function handle(Syncer $syncer): void
    {
        $syncer->remove($this->records);
    }
}
