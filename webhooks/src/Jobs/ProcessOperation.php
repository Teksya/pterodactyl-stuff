<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use Pterodactyl\Events\Server\OperationCompleted;

/** Turns a completed server operation (install, suspension, transfer...) into deliveries. */
final class ProcessOperation implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    /** Once: a retry after some deliveries were queued would queue them twice. */
    public int $tries = 1;

    public function __construct(
        public readonly string $serverUuid,
        public readonly string $operation,
        public readonly bool $successful,
        public readonly string $resourceUuid,
    ) {}

    public function handle(EventBuilder $builder, Dispatcher $dispatcher): void
    {
        $event = $builder->fromOperation(new OperationCompleted($this->serverUuid, $this->operation, $this->successful, $this->resourceUuid));
        if ($event !== null) {
            $dispatcher->dispatch($event);
        }
    }
}
