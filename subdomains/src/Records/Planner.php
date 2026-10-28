<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Records;

use OlivierDutoit\Subdomains\Dns\DnsException;
use OlivierDutoit\Subdomains\Dns\DnsRecord;
use OlivierDutoit\Subdomains\Models\Subdomain;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;

/** The records a subdomain needs: its name pointing at the allocation's address, and SRV when the game looks one up. */
final class Planner
{
    /**
     * @return list<DnsRecord>
     *
     * @throws DnsException when the allocation has no public address
     */
    public function plan(Subdomain $subdomain): array
    {
        $server = $subdomain->server;
        $allocation = self::allocationOf($subdomain, $server);
        if ($allocation === null) {
            throw new DnsException('The server has no allocation to point at.');
        }

        $host = $subdomain->host();
        [$type, $content] = self::target($allocation);
        $records = [DnsRecord::host($type, $host, $content)];

        $service = Services::for($server);
        if ($service !== null) {
            $records[] = DnsRecord::srv($service, $host, (int) $allocation->port);
        }

        return $records;
    }

    /** The subdomain's own allocation while the server still has it, otherwise the server's primary one. */
    public static function allocationOf(Subdomain $subdomain, Server $server): ?Allocation
    {
        if ($subdomain->allocation_id !== null) {
            $own = $server->allocations->firstWhere('id', $subdomain->allocation_id);
            if ($own instanceof Allocation) {
                return $own;
            }
        }

        return $server->allocation;
    }

    /**
     * Where the name points: the allocation's alias, else its IP when it is public, else the
     * node's FQDN, as an A, AAAA or CNAME record.
     *
     * @return array{0: 'A'|'AAAA'|'CNAME', 1: string}
     *
     * @throws DnsException
     */
    public static function target(Allocation $allocation): array
    {
        $candidates = [$allocation->ip_alias, $allocation->ip, $allocation->node?->fqdn];
        foreach ($candidates as $candidate) {
            $value = strtolower(trim((string) $candidate));
            if ($value === '') {
                continue;
            }
            if (filter_var($value, FILTER_VALIDATE_IP) !== false) {
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                    continue;
                }

                return [filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false ? 'AAAA' : 'A', $value];
            }
            if (preg_match('/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $value)) {
                return ['CNAME', $value];
            }
        }

        throw new DnsException(sprintf(
            'The allocation %s:%d has no public address: give it an alias, or give its node a public FQDN.',
            $allocation->ip,
            $allocation->port,
        ));
    }
}
