<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Delivery;

/** How one attempt went. */
final readonly class DeliveryResult
{
    public function __construct(
        public bool $ok,
        /** Retrying cannot help: the target refused the request, or it cannot be built. */
        public bool $permanent = false,
        /** Seconds the target asked to wait (HTTP 429). */
        public ?int $retryAfter = null,
    ) {}
}
