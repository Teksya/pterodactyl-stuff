<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Records;

use OlivierDutoit\Subdomains\Dns\DnsException;
use OlivierDutoit\Subdomains\Dns\DnsProvider;
use OlivierDutoit\Subdomains\Dns\DnsRecord;
use OlivierDutoit\Subdomains\Models\Subdomain;

/** Makes a subdomain's records at the DNS provider match what it needs now. */
final class Syncer
{
    public function __construct(private readonly DnsProvider $dns, private readonly Planner $planner) {}

    /**
     * The first records of a new subdomain. Refuses a name the zone already uses for records
     * the panel did not make, and leaves nothing behind when it fails.
     *
     * @throws DnsException
     */
    public function create(Subdomain $subdomain): void
    {
        $records = $this->planner->plan($subdomain);
        $zone = $this->dns->zoneFor($subdomain->domain);

        foreach ($records as $record) {
            if ($this->dns->find($zone, $record->name) !== []) {
                throw new DnsException(sprintf('%s already has DNS records at Cloudflare.', $record->name), false);
            }
        }

        $made = [];
        try {
            foreach ($records as $record) {
                $made[] = $this->stored($record, $zone, $this->dns->create($zone, $record, self::comment($subdomain)));
            }
        } catch (DnsException $exception) {
            foreach ($made as $record) {
                $this->forget($record['zone'], $record['id']);
            }
            throw $exception;
        }

        $this->saved($subdomain, $made);
    }

    /**
     * Brings existing records up to date: rewrites each, makes the missing ones again and
     * removes those no longer needed (an SRV record after the egg changed, say).
     *
     * @throws DnsException
     */
    public function apply(Subdomain $subdomain): void
    {
        $records = $this->planner->plan($subdomain);
        $zone = $this->dns->zoneFor($subdomain->domain);
        $current = [];
        foreach ($subdomain->records ?? [] as $record) {
            $current[$record['role']] = $record;
        }

        $kept = [];
        foreach ($records as $record) {
            $existing = $current[$record->role] ?? null;
            unset($current[$record->role]);
            $id = null;

            if ($existing !== null && $existing['type'] === $record->type && $existing['zone'] === $zone) {
                try {
                    $this->dns->update($zone, $existing['id'], $record, self::comment($subdomain));
                    $id = $existing['id'];
                } catch (DnsException $exception) {
                    if (! $exception->notFound) {
                        throw $exception;
                    }
                }
            } elseif ($existing !== null) {
                // A to CNAME, say: Cloudflare cannot change a record's type in place.
                $this->dns->delete($existing['zone'], $existing['id']);
            }

            $kept[] = $this->stored($record, $zone, $id ?? $this->dns->create($zone, $record, self::comment($subdomain)));
        }

        foreach ($current as $stale) {
            $this->dns->delete($stale['zone'], $stale['id']);
        }

        $this->saved($subdomain, $kept);
    }

    /** apply(), recording a failure on the subdomain instead of throwing it. */
    public function sync(Subdomain $subdomain): bool
    {
        try {
            $this->apply($subdomain);

            return true;
        } catch (DnsException $exception) {
            $subdomain->forceFill(['status' => Subdomain::ERROR, 'error' => mb_substr($exception->getMessage(), 0, 500), 'synced_at' => now()])->save();

            return false;
        }
    }

    /**
     * @param  list<array{zone: string, id: string}>  $records
     *
     * @throws DnsException
     */
    public function remove(array $records): void
    {
        foreach ($records as $record) {
            $this->dns->delete($record['zone'], $record['id']);
        }
    }

    private function forget(string $zone, string $id): void
    {
        try {
            $this->dns->delete($zone, $id);
        } catch (DnsException) {
            // Best effort: the daily sync does not know about it, so the admin may see it at Cloudflare.
        }
    }

    /** @return array{role: string, id: string, type: string, name: string, zone: string} */
    private function stored(DnsRecord $record, string $zone, string $id): array
    {
        return ['role' => $record->role, 'id' => $id, 'type' => $record->type, 'name' => $record->name, 'zone' => $zone];
    }

    /** @param  list<array{role: string, id: string, type: string, name: string, zone: string}>  $records */
    private function saved(Subdomain $subdomain, array $records): void
    {
        $subdomain->forceFill(['records' => $records, 'status' => Subdomain::ACTIVE, 'error' => null, 'synced_at' => now()])->save();
    }

    private static function comment(Subdomain $subdomain): string
    {
        return sprintf('Pterodactyl server %s (%s)', $subdomain->server->uuidShort, $subdomain->server->name);
    }
}
