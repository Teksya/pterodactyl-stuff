export type Status = 'pending' | 'active' | 'error';

export interface Allocation {
    id: number;
    ip: string;
    alias: string | null;
    port: number;
    primary: boolean;
}

export interface Meta {
    configured: boolean;
    enabled: boolean;
    domains: string[];
    limit: number | null;
    count: number;
    min_length: number;
    can_manage: boolean;
    /** The SRV service the server's game looks up, such as _minecraft._tcp. */
    service: string | null;
    allocations: Allocation[];
}

export interface Subdomain {
    id: number;
    name: string;
    domain: string;
    host: string;
    /** What players type: the host, with the port when there is no SRV record. */
    address: string;
    srv: boolean;
    port: number | null;
    allocation_id: number | null;
    follows_primary: boolean;
    records: { type: string; name: string }[];
    status: Status;
    error: string | null;
    synced_at: string | null;
    created_at: string;
    server: { id: number; name: string; identifier: string } | null;
}

export interface SubdomainInput {
    name: string;
    domain: string;
    allocation_id: number | null;
}

export interface Availability {
    /** null when Cloudflare could not be asked. */
    available: boolean | null;
    reason: string | null;
}

export interface Check {
    ok: boolean;
    error: string | null;
    zones: string[];
    domains: { domain: string; ok: boolean; error: string | null }[];
}
