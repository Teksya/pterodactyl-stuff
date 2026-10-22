import { afterEach, beforeAll, expect, test } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Button, Card, FileInput, ProgressBar, Spinner } from '@pterodactyl/sdk';
import { preloadTheme, renderView, renderWithTheme, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from './theme';

const themes = [theme];
let rendered: RenderedView | undefined;

// The shell and the search are lazy; loading their chunks first lets renderView render them synchronously.
beforeAll(() => preloadTheme(themes));

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
});

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
