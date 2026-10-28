<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Dns;

use RuntimeException;

/** The DNS provider refused a request or could not be reached. The message is safe to show. */
final class DnsException extends RuntimeException
{
    public function __construct(string $message, public readonly bool $notFound = false)
    {
        parent::__construct($message);
    }
}
