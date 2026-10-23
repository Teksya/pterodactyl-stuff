import { http } from '@pterodactyl/sdk/api';
import type { Delivery, DeliveryDetail, DeliveryStatus, Endpoint, EndpointInput, Meta, Page, Scope, Targets } from './types';

/** Whose endpoints a screen manages, which decides the URLs it calls. */
export type Context =
    | { kind: 'admin' }
    | { kind: 'admin-server'; serverId: number }
    | { kind: 'admin-user'; userId: number }
    | { kind: 'server'; uuid: string }
    | { kind: 'account' };

const ADMIN = '/api/admin/extensions/webhooks';
const ACCOUNT = '/api/client/extensions/webhooks';

/** `owner` serves the meta, list and create calls; `item` the calls about one endpoint or delivery. */
function paths(context: Context): { owner: string; item: string } {
    switch (context.kind) {
        case 'admin':
            return { owner: ADMIN, item: ADMIN };
        case 'admin-server':
            return { owner: `${ADMIN}/servers/${context.serverId}`, item: ADMIN };
        case 'admin-user':
            return { owner: `${ADMIN}/users/${context.userId}`, item: ADMIN };
        case 'server': {
            const base = `/api/client/servers/${context.uuid}/extensions/webhooks`;
            return { owner: base, item: base };
        }
        case 'account':
            return { owner: ACCOUNT, item: ACCOUNT };
    }
}

/** The context an admin uses for an endpoint of any owner. */
export function adminContextOf(endpoint: Pick<Endpoint, 'scope' | 'server_id' | 'user_id'>): Context {
    if (endpoint.scope === 'server' && endpoint.server_id) return { kind: 'admin-server', serverId: endpoint.server_id };
    if (endpoint.scope === 'account' && endpoint.user_id) return { kind: 'admin-user', userId: endpoint.user_id };

    return { kind: 'admin' };
}

const contextKey = (context: Context) =>
    context.kind === 'admin-server' ? context.serverId : context.kind === 'admin-user' ? context.userId : context.kind === 'server' ? context.uuid : 0;

/** Every query starts with this, so one invalidation refreshes every screen. */
export const ROOT_KEY = ['webhooks'] as const;
export const metaKey = (context: Context) => [...ROOT_KEY, 'meta', context.kind, contextKey(context)] as const;
export const endpointsKey = (context: Context) => [...ROOT_KEY, 'endpoints', context.kind, contextKey(context)] as const;
export const deliveriesKey = (context: Context, endpoint: number, page: number, status: string) =>
    [...ROOT_KEY, 'deliveries', context.kind, contextKey(context), endpoint, page, status] as const;

export const getMeta = async (context: Context) => (await http.get<{ data: Meta }>(`${paths(context).owner}/meta`)).data.data;

export const listEndpoints = async (context: Context) => (await http.get<{ data: Endpoint[] }>(`${paths(context).owner}/webhooks`)).data.data;

export const createEndpoint = async (context: Context, input: EndpointInput) =>
    (await http.post<{ data: Endpoint }>(`${paths(context).owner}/webhooks`, input)).data.data;

export const updateEndpoint = async (context: Context, id: number, input: EndpointInput) =>
    (await http.patch<{ data: Endpoint }>(`${paths(context).item}/webhooks/${id}`, input)).data.data;

export const deleteEndpoint = async (context: Context, id: number) => {
    await http.delete(`${paths(context).item}/webhooks/${id}`);
};

export const testEndpoint = async (context: Context, id: number) =>
    (await http.post<{ data: DeliveryDetail }>(`${paths(context).item}/webhooks/${id}/test`)).data.data;

export const listDeliveries = async (context: Context, id: number, page: number, status: DeliveryStatus | '') =>
    (await http.get<Page<Delivery>>(`${paths(context).item}/webhooks/${id}/deliveries`, { params: { page, status: status || undefined } })).data;

export const getDelivery = async (context: Context, id: number) =>
    (await http.get<{ data: DeliveryDetail }>(`${paths(context).item}/deliveries/${id}`)).data.data;

export const redeliver = async (context: Context, id: number) =>
    (await http.post<{ data: DeliveryDetail }>(`${paths(context).item}/deliveries/${id}/redeliver`)).data.data;

export const listAllEndpoints = async (scope: Exclude<Scope, 'admin'>) =>
    (await http.get<{ data: Endpoint[] }>(`${ADMIN}/webhooks/all`, { params: { scope } })).data.data;

export const deliveryLog = async (page: number, status: DeliveryStatus | '', event: string) =>
    (await http.get<Page<Delivery>>(`${ADMIN}/deliveries`, { params: { page, status: status || undefined, event: event || undefined } })).data;

export const getTargets = async () => (await http.get<{ data: Targets }>(`${ADMIN}/targets`)).data.data;

/** The first message for each field a 422 response rejected, keyed by field path. */
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
