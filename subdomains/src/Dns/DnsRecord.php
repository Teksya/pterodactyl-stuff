<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Dns;

/**
 * A record as a subdomain wants it. `role` tells a subdomain's records apart from each other:
 * `host` is the name itself (A, AAAA or CNAME), `srv` the service record pointing at it.
 */
final readonly class DnsRecord
{
    /** @param  array{priority: int, weight: int, port: int, target: string}|null  $srv */
    private function __construct(
        public string $role,
        public string $type,
        public string $name,
        public string $content,
        public ?array $srv = null,
    ) {}

    public static function host(string $type, string $name, string $content): self
    {
        return new self('host', $type, $name, $content);
    }

    public static function srv(string $service, string $host, int $port): self
    {
        return new self('srv', 'SRV', $service.'.'.$host, $host, ['priority' => 0, 'weight' => 5, 'port' => $port, 'target' => $host]);
    }

    /** What the record points at, as lists show it. */
    public function describe(): string
    {
        return $this->srv !== null ? sprintf('%s:%d', $this->srv['target'], $this->srv['port']) : $this->content;
    }
}
