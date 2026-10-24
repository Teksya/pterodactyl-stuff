import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { http, queryClient } from '@pterodactyl/sdk/api';
import { renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type { NavItem } from '@pterodactyl/sdk/theme';
import AdminLayout from './AdminLayout';
import { DEFAULT_LAYOUT, deleteFolder, folderOf, keyOf, moveItem, organize, sections } from './organize';

const item = (id: string, label: string, extensionId?: string): NavItem =>
    ({ id, label, extensionId, destination: { to: '/panel' }, icon: null, group: null, order: 0, exact: false }) as unknown as NavItem;

const items = [
    item('index', 'Overview'),
    item('activity', 'Activity'),
    item('settings', 'Settings'),
    item('users', 'Users'),
    item('nodes', 'Nodes'),
    item('servers', 'Servers'),
    item('extensions', 'Extensions'),
    item('webhooks', 'Webhooks', 'webhooks'),
    item('sidebar', 'Sidebar', 'admin-sidebar'),
];

let rendered: RenderedView | undefined;

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
    vi.restoreAllMocks();
    queryClient.clear();
});

const shape = (layout = DEFAULT_LAYOUT) => sections(items, layout).map((section) => [section.folder?.name ?? 'top', section.items.map((entry) => entry.label)]);

test('puts the panel pages in folders and extension pages in Extensions by default', () => {
    expect(shape()).toEqual([
        ['top', ['Overview', 'Activity']],
        ['Servers', ['Servers', 'Nodes']],
        ['Users', ['Users']],
        ['Panel', ['Settings', 'Extensions', 'Sidebar']],
        ['Extensions', ['Webhooks']],
    ]);
    expect(organize(items, DEFAULT_LAYOUT).map((entry) => entry.group)).toEqual([null, null, 'Servers', 'Servers', 'Users', 'Panel', 'Panel', 'Panel', 'Extensions']);
});

test('moves an item into a folder, before another, and back on top', () => {
    const webhooks = items[7];
    let layout = moveItem(DEFAULT_LAYOUT, items, webhooks, 'servers', items[4]);
    expect(folderOf(webhooks, layout)).toBe('servers');
    expect(sections(items, layout)[1].items.map((entry) => entry.label)).toEqual(['Servers', 'Webhooks', 'Nodes']);

    layout = moveItem(layout, items, webhooks, null, null);
    expect(sections(items, layout)[0].items.map((entry) => entry.label)).toEqual(['Overview', 'Activity', 'Webhooks']);
    expect(layout.placements[keyOf(webhooks)]).toBe('top');

    // Without its folder, an item goes back to its default, or on top.
    expect(folderOf(items[3], deleteFolder(DEFAULT_LAYOUT, 'users'))).toBeNull();
});

test('draws classic admin sidebar folders that fold', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: { data: null } });
    rendered = renderView('layout.admin', { themes: [{ views: { 'layout.admin': AdminLayout } } as never], prefix: 'as', strict: false });
    const nav = screen.getByRole('navigation', { name: 'Administration' });
    const folder = within(nav).queryAllByRole('button', { expanded: true }).find((button) => button.textContent?.startsWith('Servers'));

    // The fixture's navigation has the panel's pages: Servers is a folder of them.
    expect(folder).toBeTruthy();
    const before = within(nav).getAllByRole('link').length;
    fireEvent.click(folder!);
    expect(within(nav).getAllByRole('link').length).toBeLessThan(before);
});
