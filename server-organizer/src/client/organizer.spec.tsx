import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from '@pterodactyl/sdk/api';
import { createTestServer, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type { SdkServer } from '@pterodactyl/sdk';
import { DEFAULT_LAYOUT } from './api';
import { addFolder, buildSections, deleteFolder, filterByShow, placeServer, reorder, search, sortEntries } from './organize';
import OrganizedServerList from './ServerList';
import type { Entry, Layout, ServerMeta } from './types';

const uuid = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`;

function server(n: number, name: string, owner = true): SdkServer {
    const created = createTestServer({ identifier: `id${n}`, uuid: uuid(n), name, owner });

    return { ...created, attributes: { ...created.attributes, internal_id: n } };
}

const meta = (n: number, node: [number, string], location: [number, string] | null, egg: string): ServerMeta => ({
    uuid: uuid(n),
    node_id: node[0],
    node: node[1],
    location_id: location?.[0] ?? null,
    location: location?.[1] ?? null,
    location_description: null,
    egg_id: egg.length,
    egg,
});

const servers = [server(1, 'Survival'), server(2, 'creative'), server(3, 'Lobby 10'), server(4, 'Lobby 2', false)];
const metas = [
    meta(1, [1, 'fr-1'], [1, 'eu'], 'Paper'),
    meta(2, [2, 'us-1'], [2, 'us'], 'Paper'),
    meta(3, [1, 'fr-1'], [1, 'eu'], 'Velocity'),
    meta(4, [2, 'us-1'], null, 'Velocity'),
];
const entries: Entry[] = servers.map((item, index) => ({ server: item, meta: metas[index] }));
const names = (list: Entry[]) => list.map((entry) => entry.server.attributes.name);

const layout = (change: Partial<Layout> = {}, view: Partial<Layout['view']> = {}): Layout => ({
    ...DEFAULT_LAYOUT,
    ...change,
    view: { ...DEFAULT_LAYOUT.view, ...view },
});

let rendered: RenderedView | undefined;

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
    vi.restoreAllMocks();
});

test('filters, searches and sorts like people expect', () => {
    expect(names(filterByShow(entries, 'owned'))).toEqual(['Survival', 'creative', 'Lobby 10']);
    expect(names(filterByShow(entries, 'shared'))).toEqual(['Lobby 2']);
    expect(names(search(entries, 'lobby us'))).toEqual(['Lobby 2']);
    expect(names(search(entries, 'paper'))).toEqual(['Survival', 'creative']);

    // Names compare without case and with numbers as numbers.
    expect(names(sortEntries(entries, 'name', []))).toEqual(['creative', 'Lobby 2', 'Lobby 10', 'Survival']);
    expect(names(sortEntries(entries, 'created', []))).toEqual(['Survival', 'creative', 'Lobby 10', 'Lobby 2']);
    // Servers never arranged follow the arranged ones, by name.
    expect(names(sortEntries(entries, 'custom', [uuid(3), uuid(1)]))).toEqual(['Lobby 10', 'Survival', 'creative', 'Lobby 2']);
});

test('groups into folders, nodes, locations, eggs and owners', () => {
    let folders = addFolder(DEFAULT_LAYOUT, ' Minecraft ');
    const id = folders.folders[0].id;
    expect(folders.folders[0].name).toBe('Minecraft');
    folders = placeServer(folders, uuid(1), id);

    const inFolders = buildSections(entries, folders);
    expect(inFolders.map((section) => [section.title, names(section.entries)])).toEqual([
        ['Minecraft', ['Survival']],
        ['Other servers', ['creative', 'Lobby 10', 'Lobby 2']],
    ]);
    // Without folders, one list without a header.
    expect(buildSections(entries, DEFAULT_LAYOUT).map((section) => section.title)).toEqual([null]);

    expect(buildSections(entries, layout({}, { group: 'node' })).map((section) => [section.title, names(section.entries)])).toEqual([
        ['fr-1', ['Survival', 'Lobby 10']],
        ['us-1', ['creative', 'Lobby 2']],
    ]);
    expect(buildSections(entries, layout({}, { group: 'location' })).map((section) => section.title)).toEqual(['eu', 'No location', 'us']);
    expect(buildSections(entries, layout({}, { group: 'egg' })).map((section) => section.title)).toEqual(['Paper', 'Velocity']);
    expect(buildSections(entries, layout({}, { group: 'ownership' })).map((section) => section.title)).toEqual(['Your servers', 'Shared with you']);

    // A deleted folder's servers go back with the others.
    expect(deleteFolder(folders, id)).toMatchObject({ folders: [], placements: {} });
});

test('reorders around the servers already listed', () => {
    const arranged = [uuid(1), uuid(2), uuid(3)];
    const moved = reorder(DEFAULT_LAYOUT, arranged, uuid(3), uuid(1));

    expect(moved.order).toEqual([uuid(3), uuid(1), uuid(2)]);
    expect(moved.view.sort).toBe('custom');
    expect(reorder(DEFAULT_LAYOUT, arranged, uuid(1), null).order).toEqual([uuid(2), uuid(3), uuid(1)]);
});

test('draws the dashboard in folders and moves a server from its menu', async () => {
    const saved: Layout = layout({ folders: [{ id: 'mc', name: 'Minecraft', collapsed: false }], placements: { [uuid(1)]: 'mc' } });
    vi.spyOn(http, 'get').mockImplementation(async (url: string) => {
        if (url.endsWith('/layout')) return { data: { data: saved } };
        if (url.endsWith('/server-organizer/servers')) return { data: { data: metas, meta: { truncated: false } } };
        if (url === '/api/client') return { data: { object: 'list', data: servers, meta: { pagination: { total_pages: 1 } } } };

        throw new Error(`Unexpected ${url}`);
    });
    const put = vi.spyOn(http, 'put').mockImplementation(async (_url: string, body: unknown) => ({ data: { data: body } }));

    rendered = renderView('dashboard.serverList', {
        themes: [{ views: { 'dashboard.serverList': OrganizedServerList } }],
        fixture: 'servers',
        prefix: 'so',
        strict: false,
    });

    const folder = await screen.findByRole('region', { name: 'Minecraft' });
    expect(within(folder).getByRole('link', { name: 'Survival' })).toBeTruthy();
    const others = screen.getByRole('region', { name: 'Other servers' });
    expect(within(others).getByRole('link', { name: 'creative' })).toBeTruthy();

    // Menus and filters wait for Arrange.
    expect(within(others).queryByRole('button', { name: 'Move creative to a folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Group:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }));

    fireEvent.click(within(others).getByRole('button', { name: 'Move creative to a folder' }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Minecraft' }));

    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Minecraft' })).getByRole('link', { name: 'creative' })).toBeTruthy());
    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 2000 });
    expect((put.mock.calls.at(-1)?.[1] as Layout).placements).toEqual({ [uuid(1)]: 'mc', [uuid(2)]: 'mc' });

    // The menu names the choice at once.
    fireEvent.click(screen.getByRole('button', { name: /Group:\s*Folders/ }));
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Node' }));
    expect(await screen.findByRole('button', { name: /Group:\s*Node/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'fr-1' })).toBeTruthy();
});
