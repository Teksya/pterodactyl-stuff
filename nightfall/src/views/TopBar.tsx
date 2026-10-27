import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, Folder, LogOut } from 'lucide-react';
import { Avatar, DropdownMenu, PanelLink, usePanelLocation } from '@pterodactyl/sdk';
import { Navigation, NavigationLink, Slot, View, cn, useActiveNavItem, type AppLayoutModel, type NavItem } from '@pterodactyl/sdk/theme';
import Brand from './Brand';
import NavIcon from './NavIcon';
import ServerSwitcher, { states } from './ServerSwitcher';
import { AreaSlot, areaItems, areaLabels, type Area } from './sidebar/AreaNav';
import { barItemClass, iconButtonClass } from './sidebar/styles';

/** The items in a row, cut where the group changes: a run without a group, then a folder, and so on. */
function runsOf(items: readonly NavItem[]): { group: string | null; items: NavItem[] }[] {
    const runs: { group: string | null; items: NavItem[] }[] = [];
    for (const item of items) {
        const last = runs.at(-1);
        if (last && last.group === item.group) last.items.push(item);
        else runs.push({ group: item.group, items: [item] });
    }

    return runs;
}

/** A group of pages as a folder: its name opens a menu of them, tinted while one of them is open. */
function FolderMenu({ group, items, active }: { group: string; items: NavItem[]; active: boolean }) {
    return (
        <DropdownMenu
            className='min-w-52'
            triggerClassName={cn(
                barItemClass,
                'group/folder cursor-pointer border-0 bg-transparent data-popup-open:bg-popover/70 data-popup-open:text-foreground',
                active && 'bg-primary/12 text-foreground [&_svg]:text-primary'
            )}
            triggerContent={
                <>
                    <Folder aria-hidden className='size-4 shrink-0' />
                    <span>{group}</span>
                    <ChevronDown aria-hidden className='size-3.5 shrink-0 transition-transform group-data-popup-open/folder:rotate-180' />
                </>
            }
        >
            <Navigation items={items}>
                {(item, { badge, active: open }) => (
                    <DropdownMenu.Item destination={item.destination} className={cn(open && 'text-primary [&_svg]:text-primary')}>
                        <span className='flex min-w-0 flex-1 items-center gap-2.5'>
                            <NavIcon name={item.icon} />
                            <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                            {badge}
                        </span>
                    </DropdownMenu.Item>
                )}
            </Navigation>
        </DropdownMenu>
    );
}

/**
 * The pages of the area the user is in, on one row under the bar: a server's switcher first, then
 * the pages outside any group, and each group as a folder that opens a menu of its pages. Too many
 * to fit, the row scrolls sideways, with the mouse wheel too, and keeps the page in view in sight.
 */
function AreaBar({ area }: { area: Area }) {
    const items = areaItems(area);
    const runs = runsOf(items);
    const current = useActiveNavItem(items);
    const state = area.kind === 'server' && area.state ? states[area.state] : null;
    const row = useRef<HTMLElement>(null);
    const { pathname } = usePanelLocation();

    useEffect(() => {
        row.current?.querySelector('[data-status=active]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [pathname]);
    // The row cannot scroll down, so a vertical wheel scrolls it sideways while there is more to see.
    useEffect(() => {
        const element = row.current;
        if (!element) return;

        const wheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || element.scrollWidth <= element.clientWidth) return;
            event.preventDefault();
            element.scrollLeft += event.deltaY;
        };
        element.addEventListener('wheel', wheel, { passive: false });

        return () => element.removeEventListener('wheel', wheel);
    }, []);

    return (
        <nav
            ref={row}
            aria-label={areaLabels[area.kind]}
            className={cn(
                'flex h-12 items-center gap-1 overflow-x-auto overflow-y-hidden border-t border-sidebar-border px-6',
                // A thin scrollbar, shown while the pointer is over the row or focus is in it.
                '[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--border)_transparent] focus-within:[scrollbar-color:var(--border)_transparent]'
            )}
        >
            {area.kind === 'server' && (
                <ServerSwitcher
                    area={area}
                    triggerClassName={cn(
                        'group/server mr-2 flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border-0 bg-card py-1.5 pr-2 pl-3 text-left ring-1 ring-border',
                        'transition-colors hover:bg-popover focus-visible:outline-2 focus-visible:outline-ring data-popup-open:bg-popover'
                    )}
                    triggerContent={
                        <>
                            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', state?.dot ?? 'bg-muted-foreground/50')} />
                            <span className='max-w-56 truncate text-sm font-semibold text-foreground'>{area.name}</span>
                            <span className='sr-only'>({state?.label ?? 'Unknown'})</span>
                            <ChevronDown
                                aria-hidden
                                className='size-4 shrink-0 text-muted-foreground transition-transform group-hover/server:text-foreground group-data-popup-open/server:rotate-180'
                            />
                            <span className='sr-only'>Switch server</span>
                        </>
                    }
                />
            )}
            <AreaSlot area={area} at='before' compact={false} />
            {runs.map((run) =>
                run.group === null ? (
                    <Navigation key={`links:${run.items[0].id}`} items={run.items}>
                        {(item, { badge }) => (
                            <NavigationLink item={item} className={barItemClass}>
                                <NavIcon name={item.icon} />
                                <span>{item.label}</span>
                                {badge}
                            </NavigationLink>
                        )}
                    </Navigation>
                ) : (
                    <FolderMenu
                        key={`folder:${run.group}:${run.items[0].id}`}
                        group={run.group}
                        items={run.items}
                        active={current !== undefined && run.items.includes(current)}
                    />
                )
            )}
            <AreaSlot area={area} at='after' compact={false} />
        </nav>
    );
}

/**
 * The navigation as a bar above the page, for large screens: the brand, the main links, the search,
 * the appearance menu, the account and sign-out; inside an area, its pages on a second row.
 */
export default function TopBar({ model, appearance }: { model: AppLayoutModel; appearance: ReactNode }) {
    const { brand, user, area } = model;
    const account = model.links.find((link) => link.id === 'account');

    return (
        <header id='nightfall-topbar' className='sticky top-0 z-30 border-b border-sidebar-border bg-sidebar/90 text-sidebar-foreground backdrop-blur'>
            <div className='flex h-16 items-center gap-4 px-6'>
                <PanelLink
                    destination={{ to: '/' }}
                    className='flex shrink-0 rounded-lg px-1 py-1 text-foreground no-underline focus-visible:outline-2 focus-visible:outline-ring'
                >
                    <Brand brand={brand} className='[&_img]:h-8 [&_svg]:text-primary' />
                </PanelLink>
                <nav aria-label='Main' className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]'>
                    <Slot name='nav.items.before' />
                    {model.links.map((link) => (
                        <PanelLink key={link.id} destination={link.destination} exact={link.exact} className={barItemClass}>
                            <NavIcon name={link.icon} />
                            <span>{link.label}</span>
                        </PanelLink>
                    ))}
                    <Slot name='nav.items.after' />
                </nav>
                <View name='app.search' className='w-56 shrink-0' />
                <div className='flex shrink-0 items-center gap-1'>
                    {appearance}
                    <PanelLink
                        destination={account?.destination ?? { to: '/account' }}
                        title={user.username}
                        className='flex rounded-full p-0.5 no-underline focus-visible:outline-2 focus-visible:outline-ring'
                    >
                        <span className='flex size-9 overflow-hidden rounded-full ring-2 ring-border'>
                            <Avatar name={user.uuid} image={user.avatar} size={36} />
                        </span>
                        <span className='sr-only'>{user.username}</span>
                    </PanelLink>
                    <button type='button' onClick={model.signOut} className={iconButtonClass}>
                        <LogOut aria-hidden className='size-4' />
                        <span className='sr-only'>Sign out</span>
                    </button>
                </div>
            </div>
            {area.kind !== 'dashboard' && <AreaBar key={area.kind} area={area} />}
        </header>
    );
}
