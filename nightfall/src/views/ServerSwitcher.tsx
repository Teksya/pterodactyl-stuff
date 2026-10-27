import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import {
    DropdownMenu,
    Input,
    Spinner,
    httpErrorToHuman,
    serverResourcesQueryOptions,
    usePanelLocation,
    type PanelDestination,
    type SdkServer,
} from '@pterodactyl/sdk';
import { http } from '@pterodactyl/sdk/api';
import { cn, type ServerArea, type ServerRunState } from '@pterodactyl/sdk/theme';

export const states: Record<ServerRunState, { label: string; dot: string }> = {
    running: { label: 'Running', dot: 'bg-success' },
    starting: { label: 'Starting', dot: 'bg-warning' },
    stopping: { label: 'Stopping', dot: 'bg-warning' },
    offline: { label: 'Offline', dot: 'bg-destructive' },
};

/** The client API caps a page at 100 servers; past this many pages the panel's search finds the rest. */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
/** Past this many servers the list gets a search field. */
const SEARCH_FROM = 9;
/** The first servers listed (or found) that get their state, one request each. */
const STATE_LIMIT = 30;

const serversKey = ['nightfall', 'servers'] as const;
const adminServersKey = ['nightfall', 'servers', 'admin'] as const;

interface ServerPage {
    data: SdkServer[];
    meta: { pagination: { total_pages: number } };
}

/**
 * The servers the user owns or is a subuser of, as the dashboard lists them by default; with
 * `admin`, the other users' servers a root administrator may open.
 */
async function listServers(type?: 'admin'): Promise<SdkServer[]> {
    const page = (number: number) =>
        http.get<ServerPage>('/api/client', { params: { page: number, per_page: PAGE_SIZE, type } }).then((response) => response.data);

    const first = await page(1);
    const pages = Math.min(first.meta.pagination.total_pages, MAX_PAGES);
    const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, index) => page(index + 2)));

    return [first, ...rest].flatMap((result) => result.data);
}

/**
 * The servers on the same side as the one in view: the user's own when they own it; otherwise the
 * ones they do not own, shared with them first, then (for root administrators) other users'.
 */
function useServers(owned: boolean) {
    const mine = useQuery({ queryKey: serversKey, queryFn: () => listServers(), staleTime: 30_000 });
    // Other users' servers are for root administrators: anyone else gets none, refused or not.
    const admin = useQuery({
        queryKey: adminServersKey,
        queryFn: () => listServers('admin').catch((): SdkServer[] => []),
        staleTime: 30_000,
        enabled: !owned,
    });

    const isPending = mine.isPending || (!owned && admin.isPending);
    const side = (mine.data ?? []).filter(({ attributes }) => attributes.server_owner === owned);
    const listed = new Set(side.map(({ attributes }) => attributes.uuid));
    const data = owned ? side : [...side, ...(admin.data ?? []).filter(({ attributes }) => !attributes.server_owner && !listed.has(attributes.uuid))];

    return { isPending, isError: mine.isError, error: mine.error, data };
}

/** A server's pages, with the permissions their routes ask for (any one of them). */
const sections = {
    files: ['file.*'],
    databases: ['database.*'],
    schedules: ['schedule.*'],
    users: ['user.*'],
    backups: ['backup.*'],
    network: ['allocation.*'],
    startup: ['startup.*'],
    settings: ['settings.*', 'file.sftp'],
    activity: ['activity.*'],
} as const;

/** As the panel checks a server permission: `*` grants all, `file.*` any file permission. */
function granted(permissions: readonly string[], permission: string): boolean {
    if (permissions[0] === '*') return true;
    if (permission.endsWith('.*')) return permissions.some((name) => name.startsWith(permission.slice(0, -1)));

    return permissions.includes(permission);
}

/**
 * The page of `server` matching the one open now (its files from the files, a file being edited
 * included), when the user may open it there; the console otherwise.
 */
export function destinationFor(server: SdkServer, pathname: string): PanelDestination {
    const params = { id: server.attributes.identifier };
    const section = pathname.match(/^\/server\/[^/]+\/([^/]+)/)?.[1];
    const permissions = server.meta?.user_permissions ?? [];

    if (section && Object.hasOwn(sections, section)) {
        const name = section as keyof typeof sections;

        if (sections[name].some((permission) => granted(permissions, permission))) {
            return name === 'files' ? { to: '/server/$id/files', params, hash: '/' } : { to: `/server/$id/${name}`, params };
        }
    }

    return { to: '/server/$id', params };
}

const noteClass = 'px-2.5 py-2 text-sm text-muted-foreground';

/**
 * The list in the menu, fetched when it first opens, with each listed server's state asked once (in
 * the cache entry the dashboard polls, so a fresh one is reused) and never polled from here.
 */
function ServerList({ area }: { area: ServerArea }) {
    const owned = area.server.attributes.server_owner;
    const servers = useServers(owned);
    const { pathname } = usePanelLocation();
    const [term, setTerm] = useState('');

    const search = term.trim().toLowerCase();
    const shown = servers.data.filter(({ attributes }) => !search || attributes.name.toLowerCase().includes(search));
    const others = shown.filter(({ attributes }) => attributes.identifier !== area.identifier).slice(0, STATE_LIMIT);
    const resources = useQueries({
        queries: others.map(({ attributes }) => ({ ...serverResourcesQueryOptions(attributes.uuid), staleTime: 20_000 })),
    });
    const fetched = new Map(others.map((server, index) => [server.attributes.uuid, resources[index]?.data?.attributes.current_state]));

    if (servers.isPending) {
        return (
            <div className='flex justify-center py-3'>
                <Spinner size='small' />
            </div>
        );
    }

    if (servers.isError) return <p className={noteClass}>{httpErrorToHuman(servers.error)}</p>;

    const stateOf = (server: SdkServer): ServerRunState | null => {
        if (server.attributes.identifier === area.identifier) return area.state;
        const state = fetched.get(server.attributes.uuid);

        return state && Object.hasOwn(states, state) ? (state as ServerRunState) : null;
    };
    // Letters go to the field, not the menu's type-to-select; arrows, Tab and Escape still reach the menu.
    const keepKeys = (event: KeyboardEvent) => {
        if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(event.key)) event.stopPropagation();
    };

    return (
        <>
            {servers.data.length >= SEARCH_FROM && (
                <div className='relative mb-1.5'>
                    <Search aria-hidden className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
                    <Input
                        type='search'
                        aria-label={owned ? 'Search your servers' : 'Search other servers'}
                        placeholder='Search'
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                        onKeyDown={keepKeys}
                        className='pl-9'
                    />
                </div>
            )}
            <div className='-mx-1.5 max-h-72 overflow-y-auto px-1.5'>
                {shown.map((server) => {
                    const { identifier, name } = server.attributes;
                    const current = identifier === area.identifier;
                    const state = stateOf(server);
                    const label: ReactNode = (
                        <span className='flex min-w-0 items-center gap-2.5'>
                            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', state ? states[state].dot : 'bg-muted-foreground/50')} />
                            <span className='min-w-0 flex-1 truncate'>{name}</span>
                            {state && <span className='sr-only'>({states[state].label})</span>}
                            {current && <Check aria-hidden className='size-4 shrink-0 text-primary' />}
                        </span>
                    );

                    // The server in view is checked and cannot be picked; the others are links.
                    return current ? (
                        <DropdownMenu.Item key={identifier} checked disabled className='cursor-default'>
                            {label}
                        </DropdownMenu.Item>
                    ) : (
                        <DropdownMenu.Item key={identifier} destination={destinationFor(server, pathname)}>
                            {label}
                        </DropdownMenu.Item>
                    );
                })}
            </div>
            {shown.length === 0 && <p className={noteClass}>{search ? 'No servers match.' : 'No servers.'}</p>}
        </>
    );
}

/**
 * A menu of the servers on the same side as the one in view (the user's own, or the others) that
 * opens on the same page of another, from the server card or the rail.
 */
export default function ServerSwitcher({
    area,
    triggerClassName,
    triggerContent,
}: {
    area: ServerArea;
    triggerClassName: string;
    triggerContent: ReactNode;
}) {
    return (
        <DropdownMenu triggerClassName={triggerClassName} triggerContent={triggerContent} className='w-64 max-w-[calc(100vw-2rem)]'>
            <ServerList area={area} />
        </DropdownMenu>
    );
}
