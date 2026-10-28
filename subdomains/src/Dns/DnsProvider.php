<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Dns;

/** A DNS host the records are made at. Every method throws DnsException when the provider refuses. */
interface DnsProvider
{
    /** The provider's id for the zone that holds $domain, such as example.com for play.example.com. */
    public function zoneFor(string $domain): string;

    /** @return list<array{id: string, type: string}> the records named exactly $name. */
    public function find(string $zone, string $name): array;

    /** @return string the new record's id */
    public function create(string $zone, DnsRecord $record, string $comment): string;

    /** Throws a DnsException with notFound when the record no longer exists. */
    public function update(string $zone, string $id, DnsRecord $record, string $comment): void;

    /** A record that no longer exists counts as deleted. */
    public function delete(string $zone, string $id): void;

    /** @return list<string> the zones the credentials can manage, to check them. */
    public function zones(): array;
}
