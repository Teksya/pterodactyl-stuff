<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

use OlivierDutoit\Webhooks\Scope;

/** One event an endpoint can subscribe to. */
final readonly class EventDefinition
{
    /** @param list<Scope> $scopes */
    public function __construct(
        public string $key,
        public string $group,
        public string $label,
        public Severity $severity,
        public array $scopes,
    ) {}

    public function availableTo(Scope $scope): bool
    {
        return in_array($scope, $this->scopes, true);
    }
}
