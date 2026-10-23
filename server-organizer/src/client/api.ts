import { http } from '@pterodactyl/sdk/api';
import type { SdkServer } from '@pterodactyl/sdk';
import type { Layout, ServerMeta, Show } from './types';

const BASE = '/api/client/extensions/server-organizer';

/** The panel's own client API caps a page at 100 servers; past this many pages the dashboard keeps its own list. */
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export const LAYOUT_KEY = ['server-organizer', 'layout'] as const;
export const serversKey = (type: ApiType) => ['server-organizer', 'servers', type ?? 'mine'] as const;

/** The client API's `type` for what the user shows. */
export type ApiType = 'admin' | 'admin-all' | undefined;
export const apiType = (show: Show): ApiType => (show === 'others' ? 'admin' : show === 'all' ? 'admin-all' : undefined);

export const DEFAULT_LAYOUT: Layout = {
    folders: [],
    placements: {},
    order: [],
    view: { show: 'mine', group: 'folder', sort: 'name', collapsed: [] },
};

/** PHP sends an empty map as a list. */
const normalize = (layout: Layout): Layout => ({
    ...DEFAULT_LAYOUT,
    ...layout,
    placements: Array.isArray(layout.placements) ? {} : (layout.placements ?? {}),
    view: { ...DEFAULT_LAYOUT.view, ...layout.view },
});

export const getLayout = async (): Promise<Layout> => normalize((await http.get<{ data: Layout }>(`${BASE}/layout`)).data.data);

export const saveLayout = async (layout: Layout): Promise<Layout> => normalize((await http.put<{ data: Layout }>(`${BASE}/layout`, layout)).data.data);

interface ServerPage {
    data: SdkServer[];
    meta: { pagination: { total_pages: number } };
}

export interface ServerList {
    servers: SdkServer[];
    meta: Map<string, ServerMeta>;
    /** More servers than the dashboard organises: it shows the panel's list instead. */
    truncated: boolean;
}

/** Every server the user may see for `type`, as the client API returns them, with what it leaves out. */
export async function listServers(type: ApiType): Promise<ServerList> {
    const page = (number: number) =>
        http.get<ServerPage>('/api/client', { params: { page: number, per_page: PAGE_SIZE, type } }).then((response) => response.data);

    const [first, extra] = await Promise.all([
        page(1),
        http.get<{ data: ServerMeta[]; meta: { truncated: boolean } }>(`${BASE}/servers`, { params: { type } }).then((response) => response.data),
    ]);
    const pages = first.meta.pagination.total_pages;
    const rest = pages > 1 && pages <= MAX_PAGES ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => page(index + 2))) : [];

    return {
        servers: [first, ...rest].flatMap((result) => result.data),
        meta: new Map(extra.data.map((meta) => [meta.uuid, meta])),
        truncated: pages > MAX_PAGES || extra.meta.truncated,
    };
}
