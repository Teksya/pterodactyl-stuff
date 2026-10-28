import type { Allocation, Meta, Subdomain } from './types';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** What a typed name becomes: lower case, spaces and underscores as hyphens, nothing else a DNS label refuses. */
export function normalizeName(input: string): string {
    return input
        .toLowerCase()
        .replace(/[\s_.]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 63);
}

/** Why the panel would refuse the name, as the server checks it; null when it may be free. */
export function nameProblem(name: string, minLength: number): string | null {
    if (name === '') return null;
    if (name.length < minLength) return `At least ${minLength} characters.`;
    if (!LABEL.test(name)) return 'Letters, digits and hyphens, without a hyphen at either end.';

    return null;
}

export function allocationLabel(allocation: Pick<Allocation, 'ip' | 'alias' | 'port'>): string {
    return `${allocation.alias ?? allocation.ip}:${allocation.port}`;
}

/** What players will type for this name: the host alone with SRV, otherwise with the port. */
export function addressOf(host: string, service: string | null, port: number | null): string {
    return service || port === null ? host : `${host}:${port}`;
}

export function gameOf(service: string | null): string | null {
    switch (service) {
        case '_minecraft._tcp':
            return 'Minecraft';
        case '_ts3._udp':
            return 'TeamSpeak';
        case '_mumble._tcp':
            return 'Mumble';
        default:
            return service ? service : null;
    }
}

export function stateOf(subdomain: Pick<Subdomain, 'status' | 'error'>): { label: string; tone: Tone; hint?: string } {
    switch (subdomain.status) {
        case 'active':
            return { label: 'Active', tone: 'success' };
        case 'error':
            return { label: 'Error', tone: 'danger', hint: subdomain.error ?? undefined };
        default:
            return { label: 'Pending', tone: 'warning' };
    }
}

/** Why the server cannot take another name, or null when it can. */
export function blockedReason(meta: Meta): string | null {
    if (!meta.configured) return 'The administrator has not finished setting up subdomains.';
    if (!meta.enabled) return 'The administrator has turned subdomains off.';
    if (meta.domains.length === 0) return 'No domain is offered yet.';
    if (meta.limit !== null && meta.count >= meta.limit) {
        return meta.limit === 0 ? 'Subdomains are not available for this server.' : `This server has the most subdomains it can have (${meta.limit}).`;
    }

    return null;
}
