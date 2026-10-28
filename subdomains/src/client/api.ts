import { http } from '@pterodactyl/sdk/api';
import type { Availability, Check, Meta, Subdomain, SubdomainInput } from './types';

/** Whose subdomains a screen manages, which decides the URLs it calls. */
export type Context = { kind: 'server'; uuid: string } | { kind: 'admin-server'; serverId: number };

const ADMIN = '/api/admin/extensions/subdomains';

/** `owner` serves the meta, list, availability and create calls; `item` the calls about one subdomain. */
function paths(context: Context): { owner: string; item: string; available: string } {
    if (context.kind === 'server') {
        const base = `/api/client/servers/${context.uuid}/extensions/subdomains`;
        return { owner: base, item: base, available: `${base}/available` };
    }

    return { owner: `${ADMIN}/servers/${context.serverId}`, item: ADMIN, available: `${ADMIN}/available` };
}

const contextKey = (context: Context) => (context.kind === 'server' ? context.uuid : context.serverId);

/** Every query starts with this, so one invalidation refreshes every screen. */
export const ROOT_KEY = ['subdomains'] as const;
export const metaKey = (context: Context) => [...ROOT_KEY, 'meta', context.kind, contextKey(context)] as const;
export const listKey = (context: Context) => [...ROOT_KEY, 'list', context.kind, contextKey(context)] as const;

export const getMeta = async (context: Context) => (await http.get<{ data: Meta }>(`${paths(context).owner}/meta`)).data.data;

export const listSubdomains = async (context: Context) => (await http.get<{ data: Subdomain[] }>(`${paths(context).owner}/subdomains`)).data.data;

export const checkAvailable = async (context: Context, name: string, domain: string) =>
    (await http.get<{ data: Availability }>(paths(context).available, { params: { name, domain } })).data.data;

export const createSubdomain = async (context: Context, input: SubdomainInput) =>
    (await http.post<{ data: Subdomain }>(`${paths(context).owner}/subdomains`, input)).data.data;

export const moveSubdomain = async (context: Context, id: number, allocationId: number | null) =>
    (await http.patch<{ data: Subdomain }>(`${paths(context).item}/subdomains/${id}`, { allocation_id: allocationId })).data.data;

export const deleteSubdomain = async (context: Context, id: number) => {
    await http.delete(`${paths(context).item}/subdomains/${id}`);
};

export const syncSubdomain = async (context: Context, id: number) =>
    (await http.post<{ data: Subdomain }>(`${paths(context).item}/subdomains/${id}/sync`)).data.data;

export const listAll = async () => (await http.get<{ data: Subdomain[] }>(`${ADMIN}/subdomains`)).data.data;

export const checkConnection = async () => (await http.get<{ data: Check }>(`${ADMIN}/check`)).data.data;

/** The first message for each field a 422 response rejected, keyed by field. */
export function validationErrors(cause: unknown): Record<string, string> {
    const data = (cause as { response?: { status?: number; data?: unknown } } | null)?.response;
    if (data?.status !== 422 || !data.data || typeof data.data !== 'object') return {};

    const errors: Record<string, string> = {};
    const list = (data.data as { errors?: unknown }).errors;
    for (const error of Array.isArray(list) ? list : []) {
        const field = (error as { meta?: { source_field?: unknown } })?.meta?.source_field;
        const detail = (error as { detail?: unknown })?.detail;
        if (typeof field === 'string' && typeof detail === 'string' && !(field in errors)) errors[field] = detail;
    }

    return errors;
}
