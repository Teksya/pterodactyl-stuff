import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import {
    Button,
    Card,
    FileInput,
    ProgressBar,
    Spinner,
    serverResourcesQueryOptions,
    type SdkServer,
    type SdkServerResources,
} from '@pterodactyl/sdk';
import { client, http, queryClient } from '@pterodactyl/sdk/api';
import { createTestServer, preloadTheme, renderView, renderWithTheme, type RenderedView } from '@pterodactyl/sdk/testing';
import type { ThemeDefinition, ViewProps } from '@pterodactyl/sdk/theme';
import theme from './theme';
import { destinationFor } from './views/ServerSwitcher';

const themes = [theme];
let rendered: RenderedView | undefined;

// The shell and the search are lazy; loading their chunks first lets renderView render them synchronously.
beforeAll(() => preloadTheme(themes));

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
    vi.restoreAllMocks();
    queryClient.clear();
});

/** Answers the client API's server list with `servers`, on one page, and every server as offline. */
function serveServers(servers: SdkServer[]) {
    const offline = { object: 'stats', attributes: { current_state: 'offline' } } as SdkServerResources;
    // States come through the generated API client, as the dashboard asks for them.
    vi.spyOn(client, 'get').mockImplementation((async () => ({ data: offline })) as unknown as typeof client.get);

    return vi.spyOn(http, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/client') return { data: { object: 'list', data: servers, meta: { pagination: { total_pages: 1 } } } };

        throw new Error(`Unexpected ${url}`);
    });
}

const probe = () => <span>probe</span>;

test('puts the brand, the search, the links and the user in a sidebar beside the page', () => {
    rendered = renderView('layout.app', { themes, fixture: 'admin' });

    const sidebar = document.getElementById('nightfall-sidebar');
    const nav = screen.getByRole('navigation', { name: 'Main' });

    expect(nav.closest('aside')).toBe(sidebar);
    expect(nav.textContent).toContain('Admin');
    expect(sidebar?.textContent).toContain('Search');
    expect(rendered.container.querySelector('main#main')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
});

test('keeps the slots around the main links', () => {
    rendered = renderView('layout.app', {
        themes,
        fixture: 'user',
        slots: { 'nav.items.before': () => <span>before</span>, 'nav.items.after': () => <span>after</span> },
    });

    const nav = screen.getByRole('navigation', { name: 'Main' }).textContent;

    expect(nav?.indexOf('before')).toBeLessThan(nav?.indexOf('after') ?? 0);
});

test("puts an area's pages first and folds the main links away at the foot of the sidebar", () => {
    localStorage.removeItem('nightfall.sidebar.links-collapsed');
    rendered = renderView('layout.app', { themes, fixture: 'serverArea', slots: { 'nav.items.after': probe } });

    const server = screen.getByRole('navigation', { name: 'Server' });
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(server.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const fold = screen.getByRole('button', { name: 'Panel' });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(fold);
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('nightfall-main-links')?.classList.contains('hidden')).toBe(true);
    // Folded, the links and the slots around them stay mounted.
    expect(main.textContent).toContain('probe');
    expect(localStorage.getItem('nightfall.sidebar.links-collapsed')).toBe('1');

    // The choice holds on the next page; the dashboard, with no area, always shows them.
    rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
    expect(screen.getByRole('button', { name: 'Panel' }).getAttribute('aria-expanded')).toBe('false');
    rendered = renderView('layout.app', { themes, fixture: 'user' });
    expect(screen.queryByRole('button', { name: 'Panel' })).toBeNull();
    localStorage.removeItem('nightfall.sidebar.links-collapsed');
});

test('folds the sidebar into a rail of icons, the mark and the avatar, and remembers it', () => {
    localStorage.removeItem('nightfall.sidebar.rail');
    rendered = renderView('layout.app', { themes, fixture: 'serverArea', slots: { 'server.navigation.after': probe } });

    const sidebar = document.getElementById('nightfall-sidebar');
    const fold = screen.getByRole('button', { name: 'Collapse the sidebar' });
    expect(sidebar?.hasAttribute('data-rail')).toBe(false);

    fireEvent.click(fold);
    expect(sidebar?.hasAttribute('data-rail')).toBe(true);
    expect(sidebar?.className).toContain('lg:w-18');
    expect(localStorage.getItem('nightfall.sidebar.rail')).toBe('1');

    // Labels stay for screen readers and show as tooltips; the slots stay, told they are compact.
    const consoleLink = screen.getByRole('link', { name: 'Console' });
    expect(consoleLink.getAttribute('title')).toBe('Console');
    expect(consoleLink.querySelector('span')?.className).toContain('lg:group-data-rail/sidebar:sr-only');
    expect(screen.getByRole('navigation', { name: 'Server' }).textContent).toContain('probe');
    expect(screen.getByTitle('Survival: Running')).toBeTruthy();

    rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
    expect(document.getElementById('nightfall-sidebar')?.hasAttribute('data-rail')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Expand the sidebar' }));
    expect(document.getElementById('nightfall-sidebar')?.hasAttribute('data-rail')).toBe(false);
    localStorage.removeItem('nightfall.sidebar.rail');
});

test('gathers the file rows into one card', () => {
    rendered = renderView('server.files.manager', { themes });

    const list = rendered.container.querySelector('.rounded-xl.border');
    expect(list?.children.length).toBeGreaterThan(1);
    expect(list?.className).toContain('[&>*]:bg-transparent');
});

test('gathers the activity entries into one rounded card', () => {
    rendered = renderView('activity.log', { themes });

    const log = rendered.container.firstElementChild;
    expect(log?.className).toContain('[&_.bg-card]:rounded-xl');
    expect(log?.querySelector('.bg-card')).not.toBeNull();
});

test('draws the file input as a field with a primary button', () => {
    rendered = renderWithTheme(<FileInput aria-label='Package' />, { themes });
    const input = rendered.container.querySelector('input[type="file"]')?.className ?? '';

    expect(input).toContain('rounded-lg');
    expect(input).toContain('file:bg-primary');
    expect(input).not.toContain('file:bg-popover');
});

test("keeps classic's page bar and draws a thin spinner ring", () => {
    rendered = renderWithTheme(<ProgressBar variant='page' value={40} />, { themes });
    const bar = rendered.container.querySelector('[data-ui="progress-bar"]');
    expect(bar?.className).toContain('h-0.5');
    expect(bar?.querySelector('[data-part="indicator"]')?.className).toContain('shadow-progress');

    rendered = renderWithTheme(<Spinner size='large' />, { themes });
    const ring = rendered.container.querySelector('[data-ui="spinner"][data-part="root"]')?.className ?? '';
    expect(ring).toContain('border-t-primary');
    expect(ring).toContain('border-[3px]');
    expect(ring).not.toContain('border-[6px]');
});

test('opens the sidebar as a drawer from the menu button, and closes it on Escape', () => {
    rendered = renderView('layout.app', { themes, fixture: 'user' });

    const menu = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
});

test('offers the scheme menu only when the theme has both schemes', () => {
    rendered = renderView('layout.app', { themes, fixture: 'user' });
    expect(screen.queryByRole('button', { name: 'Color scheme' })).toBeNull();

    rendered = renderView('layout.app', { themes, fixture: 'schemes' });
    expect(screen.getByRole('button', { name: 'Color scheme' })).toBeTruthy();
});

test('draws the server navigation, with its state and its slots, in the sidebar', () => {
    rendered = renderView('layout.app', {
        themes,
        fixture: 'serverArea',
        slots: { 'server.navigation.after': ({ data }) => <span>Mods for {data.attributes.name}</span> },
    });

    const nav = screen.getByRole('navigation', { name: 'Server' }).textContent;

    expect(nav).toContain('Survival');
    expect(nav).toContain('Running');
    expect(nav).toContain('Backups');
    expect(nav).toContain('Mods for Survival');
});

test("switches to another server from the server card's menu, the current one checked", async () => {
    const current = createTestServer({ identifier: 'srv-current', name: 'Survival', permissions: ['*'] });
    const other = createTestServer({ identifier: 'lobby1', uuid: '22222222-2222-4222-8222-222222222222', name: 'Lobby', permissions: ['*'] });
    // The fixture's server is the one in view, whatever its identifier.
    rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
    const identifier = screen.getByRole('navigation', { name: 'Server' }).querySelector('a')?.getAttribute('href')?.split('/')[2];
    const get = serveServers([{ ...current, attributes: { ...current.attributes, identifier: identifier ?? 'srv-current' } }, other]);

    // Nothing is fetched until a menu opens; the card and the rail each have a trigger.
    expect(get).not.toHaveBeenCalled();
    const triggers = screen.getAllByRole('button', { name: /Switch server/ });
    expect(triggers).toHaveLength(2);
    // The whole card, with the server's name and state, is the trigger.
    expect(triggers[0].textContent).toContain('Survival');
    expect(triggers[0].textContent).toContain('Running');

    fireEvent.click(triggers[0]);
    const menu = await screen.findByRole('menu');
    expect(get).toHaveBeenCalledWith('/api/client', { params: { page: 1, per_page: 100 } });

    // The current server keeps its live state and cannot be picked.
    const survival = await within(menu).findByRole('menuitemcheckbox', { name: /Survival/ });
    expect(survival.getAttribute('aria-checked')).toBe('true');
    expect(survival.getAttribute('aria-disabled')).toBe('true');
    expect(survival.textContent).toContain('(Running)');
    // The others' states are asked once each, in the dashboard's cache entry.
    const lobby = await within(menu).findByRole('menuitem', { name: 'Lobby (Offline)' });
    expect(lobby.getAttribute('href')).toBe('/server/lobby1');
    expect(lobby.querySelector('.bg-destructive')).not.toBeNull();
    expect(queryClient.getQueryData(serverResourcesQueryOptions(other.attributes.uuid).queryKey)?.attributes.current_state).toBe('offline');
    // A short list needs no search field.
    expect(within(menu).queryByRole('searchbox')).toBeNull();
});

test('searches the switcher once there are more than eight servers', async () => {
    const servers = Array.from({ length: 12 }, (_, index) =>
        createTestServer({ identifier: `srv${index}`, uuid: `0000000${index}-0000-4000-8000-000000000000`, name: index % 2 ? `Lobby ${index}` : `Survival ${index}` })
    );
    serveServers(servers);
    rendered = renderView('layout.app', { themes, fixture: 'serverArea' });

    fireEvent.click(screen.getAllByRole('button', { name: /Switch server/ })[1]);
    const menu = await screen.findByRole('menu');
    const field = await within(menu).findByRole('searchbox', { name: 'Search your servers' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(12);

    // Letters typed in the field stay there instead of jumping to a matching item.
    field.focus();
    fireEvent.keyDown(field, { key: 'L' });
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: 'lobby' } });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.replace(/\(.*\)$/, ''))).toEqual(['Lobby 1', 'Lobby 3', 'Lobby 5', 'Lobby 7', 'Lobby 9', 'Lobby 11']);
    fireEvent.change(field, { target: { value: 'nether' } });
    expect(within(menu).queryAllByRole('menuitem')).toHaveLength(0);
    expect(menu.textContent).toContain('No servers match.');
});

test('opens the same page of the other server when its user may see it, the console otherwise', () => {
    const server = (permissions: string[]) => createTestServer({ identifier: 'lobby1', permissions });

    expect(destinationFor(server(['*']), '/server/abc/files/edit')).toEqual({ to: '/server/$id/files', params: { id: 'lobby1' }, hash: '/' });
    expect(destinationFor(server(['backup.read']), '/server/abc/backups')).toEqual({ to: '/server/$id/backups', params: { id: 'lobby1' } });
    expect(destinationFor(server(['*']), '/server/abc/schedules/4')).toEqual({ to: '/server/$id/schedules', params: { id: 'lobby1' } });
    expect(destinationFor(server(['file.sftp']), '/server/abc/settings')).toEqual({ to: '/server/$id/settings', params: { id: 'lobby1' } });
    // Without the permission, outside a server page, or on an extension's page: the console.
    expect(destinationFor(server(['control.start']), '/server/abc/backups')).toEqual({ to: '/server/$id', params: { id: 'lobby1' } });
    expect(destinationFor(server(['*']), '/server/abc')).toEqual({ to: '/server/$id', params: { id: 'lobby1' } });
    expect(destinationFor(server(['*']), '/server/abc/constructor')).toEqual({ to: '/server/$id', params: { id: 'lobby1' } });
    expect(destinationFor(server(['*']), '/account')).toEqual({ to: '/server/$id', params: { id: 'lobby1' } });
});

test('draws the account and admin navigation with their slots', () => {
    rendered = renderView('layout.app', { themes, fixture: 'accountArea', slots: { 'account.navigation.before': probe } });
    const account = screen.getByRole('navigation', { name: 'Account' }).textContent;

    expect(account).toContain('SSH Keys');
    expect(account).toContain('probe');

    rendered = renderView('layout.app', { themes, fixture: 'adminArea', slots: { 'panel.navigation.after': probe } });
    const admin = screen.getByRole('navigation', { name: 'Administration' }).textContent;

    expect(admin).toContain('Themes');
    expect(admin).toContain('probe');
});

test('folds a group of the area navigation from its heading, and remembers it', () => {
    localStorage.clear();
    // A layer that puts the admin pages after the first two in a group, as an extension may.
    const grouping = {
        views: {
            'layout.app': ({ model, Default, children }: ViewProps<'layout.app'>) => (
                <Default
                    model={
                        model.area.kind === 'admin'
                            ? { ...model, area: { ...model.area, nav: { items: model.area.nav.items.map((item, index) => ({ ...item, group: index < 2 ? null : 'Folder A' })) } } }
                            : model
                    }
                >
                    {children}
                </Default>
            ),
        },
    } as unknown as ThemeDefinition;
    rendered = renderView('layout.app', { themes: [theme, grouping], fixture: 'adminArea' });
    const nav = screen.getByRole('navigation', { name: 'Administration' });
    const third = within(nav).getAllByRole('link')[2].textContent ?? '';

    fireEvent.click(within(nav).getByRole('button', { name: 'Folder A' }));
    expect(within(nav).getByRole('button', { name: 'Folder A' }).getAttribute('aria-expanded')).toBe('false');
    expect(nav.textContent).not.toContain(third);

    rendered = renderView('layout.app', { themes: [theme, grouping], fixture: 'adminArea' });
    expect(screen.getByRole('navigation', { name: 'Administration' }).textContent).not.toContain(third);
});

test('leaves only the page to the area layouts', () => {
    for (const view of ['layout.server', 'layout.account', 'layout.admin'] as const) {
        rendered = renderView(view, { themes });

        expect(screen.queryByRole('navigation')).toBeNull();
        expect(rendered.container.querySelector('main#main')).not.toBeNull();
    }
});

test('searches servers from the sidebar field, in a dialog', () => {
    rendered = renderView('app.search', { themes, fixture: 'closed' });
    const trigger = screen.getByRole('button', { name: /Search/ });
    expect(trigger.getAttribute('aria-keyshortcuts')).toBeTruthy();

    rendered = renderView('app.search', { themes, fixture: 'results' });
    expect(screen.getByRole('dialog').textContent).toContain('Search servers');
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);

    rendered = renderView('app.search', { themes, fixture: 'none' });
    expect(screen.getByText('No servers found')).toBeTruthy();
});

test('renders every layout.app and app.search fixture without dropping a slot', () => {
    const fixtures = {
        'layout.app': ['user', 'admin', 'schemes', 'logo', 'accountArea', 'serverArea', 'adminArea'],
        'app.search': ['closed', 'results', 'loading', 'none', 'short', 'error'],
    } as const;

    for (const [view, names] of Object.entries(fixtures) as [keyof typeof fixtures, readonly string[]][]) {
        for (const fixture of names) {
            expect(() => (rendered = renderView(view, { themes, fixture, strict: true })), `${view} ${fixture}`).not.toThrow();
        }
    }
});

test('softens the UI kit: sentence-case rounded buttons and rounded cards', () => {
    rendered = renderWithTheme(<Button>Save</Button>, { themes });
    const button = rendered.container.querySelector('button')?.className ?? '';

    expect(button).toContain('rounded-lg');
    expect(button).toContain('normal-case');
    expect(button).not.toContain('uppercase');

    rendered = renderWithTheme(<Card title='Details'>Body</Card>, { themes });
    expect(rendered.container.querySelector('[data-ui="card"]')?.className).toContain('rounded-xl');
});
