import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { Avatar, DropdownMenu, PanelLink, SpinnerOverlay, usePanelLocation } from '@pterodactyl/sdk';
import {
    Main,
    Navigation,
    NavigationLink,
    Slot,
    View,
    cn,
    type AccountArea,
    type AdminArea,
    type AppArea,
    type AppLayoutModel,
    type NavItem,
    type ServerArea,
    type ViewProps,
} from '@pterodactyl/sdk/theme';
import Brand from './Brand';
import NavIcon from './NavIcon';
import ServerSwitcher, { states } from './ServerSwitcher';

type Area = AccountArea | ServerArea | AdminArea;

/*
 * Folded into a rail (`data-rail` on the sidebar, from the `lg` breakpoint), the sidebar keeps its
 * icons, the mark and the avatar: labels stay for screen readers, headings and the rest go.
 */
const railSrOnly = 'lg:group-data-rail/sidebar:sr-only';
const railHidden = 'lg:group-data-rail/sidebar:hidden';
const railCentered = 'lg:group-data-rail/sidebar:justify-center lg:group-data-rail/sidebar:px-0';

/** A link of the sidebar; the active one is tinted with the primary colour, its icon in full. */
const itemClass = [
    'flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline',
    railCentered,
    'text-muted-foreground transition-colors hover:bg-popover/70 hover:text-foreground',
    'data-[status=active]:bg-primary/12 data-[status=active]:text-foreground data-[status=active]:[&_svg]:text-primary',
    'focus-visible:outline-2 focus-visible:outline-ring',
].join(' ');

const iconButtonClass = [
    'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0',
    'text-muted-foreground transition-colors hover:bg-popover/70 hover:text-foreground',
    'focus-visible:outline-2 focus-visible:outline-ring',
].join(' ');

/** A thin scrollbar that shows only while the pointer is over the sidebar, or focus is in it. */
const scrollerClass = [
    '[scrollbar-width:thin] [scrollbar-color:transparent_transparent]',
    'group-hover/sidebar:[scrollbar-color:var(--border)_transparent] focus-within:[scrollbar-color:var(--border)_transparent]',
    '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent',
    'group-hover/sidebar:[&::-webkit-scrollbar-thumb]:bg-border',
].join(' ');

const headingClass ='px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/70';

/** The slots of an area's navigation, which its own layout renders in classic. */
function AreaSlot({ area, at, compact }: { area: Area; at: 'before' | 'after'; compact: boolean }) {
    if (area.kind === 'server') return <Slot name={`server.navigation.${at}`} data={area.server} compact={compact} />;
    if (area.kind === 'account') return <Slot name={`account.navigation.${at}`} compact={compact} />;

    return <Slot name={`panel.navigation.${at}`} compact={compact} />;
}

/** The pages of the area the user is in, with a heading where a group of items starts. */
function AreaNav({ area, rail }: { area: AppArea; rail: boolean }) {
    if (area.kind === 'dashboard') return null;

    const items: readonly NavItem[] = area.kind === 'server' && area.adminLink ? [...area.nav.items, area.adminLink] : area.nav.items;
    const label = { server: 'Server', account: 'Account', admin: 'Administration' }[area.kind];
    const groupStarts = new Set(items.filter((item, index) => item.group && item.group !== items[index - 1]?.group));
    const state = area.kind === 'server' && area.state ? states[area.state] : null;

    return (
        <nav aria-label={label} className='flex min-w-0 flex-col gap-0.5'>
            {area.kind === 'server' ? (
                <>
                    {/* The whole card opens the server menu. */}
                    <ServerSwitcher
                        area={area}
                        triggerClassName={cn(
                            'group/server mb-2 flex w-full cursor-pointer items-center gap-2 rounded-xl border-0 bg-card py-2.5 pr-3 pl-3 text-left ring-1 ring-border',
                            'transition-colors hover:bg-popover focus-visible:outline-2 focus-visible:outline-ring data-popup-open:bg-popover',
                            railHidden
                        )}
                        triggerContent={
                            <>
                                <span className='min-w-0 flex-1'>
                                    <span className='block truncate text-sm font-semibold text-foreground'>{area.name}</span>
                                    <span className='mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground'>
                                        <span aria-hidden className={cn('size-2 rounded-full', state?.dot ?? 'bg-muted-foreground/50')} />
                                        {state?.label ?? 'Unknown'}
                                    </span>
                                </span>
                                <ChevronDown
                                    aria-hidden
                                    className='size-4 shrink-0 text-muted-foreground transition-transform group-hover/server:text-foreground group-data-popup-open/server:rotate-180'
                                />
                                <span className='sr-only'>Switch server</span>
                            </>
                        }
                    />
                    {/* In the rail: the server's initial, with its state as a dot, opens the same menu. */}
                    <ServerSwitcher
                        area={area}
                        triggerClassName={cn(
                            'relative mx-auto mb-2 hidden size-10 cursor-pointer rounded-xl border-0 bg-card p-0 text-sm font-semibold text-foreground ring-1 ring-border',
                            'transition-colors hover:bg-popover focus-visible:outline-2 focus-visible:outline-ring lg:group-data-rail/sidebar:flex'
                        )}
                        triggerContent={
                            <span title={`${area.name}: ${state?.label ?? 'Unknown'}`} className='flex size-full items-center justify-center'>
                                <span aria-hidden>{area.name.trim().charAt(0).toUpperCase() || '?'}</span>
                                <span className='sr-only'>Switch server</span>
                                <span
                                    aria-hidden
                                    className={cn('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar', state?.dot ?? 'bg-muted-foreground')}
                                />
                            </span>
                        }
                    />
                </>
            ) : (
                <p className={cn(headingClass, railHidden)}>{label}</p>
            )}
            <div className='min-w-0 overflow-hidden'>
                <AreaSlot area={area} at='before' compact={rail} />
            </div>
            <Navigation items={items}>
                {(item, { badge }) => (
                    <>
                        {groupStarts.has(item) && (
                            <>
                                <p className={cn(headingClass, 'mt-3', railHidden)}>{item.group}</p>
                                <hr aria-hidden className='mx-2 my-2 hidden border-sidebar-border lg:group-data-rail/sidebar:block' />
                            </>
                        )}
                        <NavigationLink item={item} title={rail ? item.label : undefined} className={itemClass}>
                            <NavIcon name={item.icon} />
                            <span className={cn('min-w-0 flex-1 truncate', railSrOnly)}>{item.label}</span>
                            <span className={railHidden}>{badge}</span>
                        </NavigationLink>
                    </>
                )}
            </Navigation>
            <div className='min-w-0 overflow-hidden'>
                <AreaSlot area={area} at='after' compact={rail} />
            </div>
        </nav>
    );
}

const schemeIcons = { dark: Moon, light: Sun, system: Monitor } as const;
const schemeLabels = { dark: 'Dark', light: 'Light', system: 'System' } as const;

/** Only rendered when the theme offers more than one scheme. */
function SchemeMenu({ model, setScheme }: { model: AppLayoutModel; setScheme: NonNullable<AppLayoutModel['setScheme']> }) {
    const Current = schemeIcons[model.scheme];

    return (
        <DropdownMenu
            triggerClassName={iconButtonClass}
            triggerContent={
                <>
                    <Current aria-hidden className='size-4' />
                    <span className='sr-only'>Color scheme</span>
                </>
            }
        >
            {[...model.schemes, 'system' as const].map((scheme) => (
                <DropdownMenu.Item
                    key={scheme}
                    icon={schemeIcons[scheme]}
                    checked={scheme === model.preference}
                    onClick={() => setScheme(scheme)}
                >
                    {schemeLabels[scheme]}
                </DropdownMenu.Item>
            ))}
        </DropdownMenu>
    );
}

/** A choice kept in the browser; without storage it lasts until the next page load. */
function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeFlag(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, value ? '1' : '0');
    } catch {
        // Kept in memory only.
    }
}

const linksKey = 'nightfall.sidebar.links-collapsed';
const railKey = 'nightfall.sidebar.rail';

/**
 * The dashboard, admin and account links with the slots around them. Inside an area they sit at the
 * foot of the sidebar, under the area's own pages, and fold away behind their heading.
 */
function MainLinks({ model, foldable, rail }: { model: AppLayoutModel; foldable: boolean; rail: boolean }) {
    const [collapsed, setCollapsed] = useState(() => readFlag(linksKey));
    // The rail has no heading to unfold them from, so it always shows the links.
    const hidden = foldable && collapsed;
    const toggle = () => {
        setCollapsed(!collapsed);
        writeFlag(linksKey, !collapsed);
    };

    return (
        <nav aria-label='Main' className={cn('flex min-w-0 flex-col gap-0.5', foldable && 'mt-auto')}>
            {foldable && (
                <button
                    type='button'
                    aria-expanded={!hidden}
                    aria-controls='nightfall-main-links'
                    onClick={toggle}
                    className={cn(
                        headingClass,
                        'flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent py-1 text-left hover:text-foreground',
                        railHidden
                    )}
                >
                    <span className='flex-1'>Panel</span>
                    <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', hidden && '-rotate-90')} />
                </button>
            )}
            <div
                id='nightfall-main-links'
                className={cn('min-w-0 flex-col gap-0.5', hidden ? 'hidden lg:group-data-rail/sidebar:flex' : 'flex')}
            >
                <div className='min-w-0 overflow-hidden'>
                    <Slot name='nav.items.before' compact={rail} />
                </div>
                {model.links.map((link) => (
                    <PanelLink
                        key={link.id}
                        destination={link.destination}
                        exact={link.exact}
                        title={rail ? link.label : undefined}
                        className={itemClass}
                    >
                        <NavIcon name={link.icon} />
                        <span className={cn('min-w-0 flex-1 truncate', railSrOnly)}>{link.label}</span>
                    </PanelLink>
                ))}
                <div className='min-w-0 overflow-hidden'>
                    <Slot name='nav.items.after' compact={rail} />
                </div>
            </div>
        </nav>
    );
}

/** A sidebar beside the page on large screens, and a drawer behind a menu button below them. */
export default function Shell({ model, className, children }: ViewProps<'layout.app'>) {
    const { brand, user } = model;
    const account = model.links.find((link) => link.id === 'account');
    const [open, setOpen] = useState(false);
    const [rail, setRail] = useState(() => readFlag(railKey));
    const { pathname } = usePanelLocation();
    const toggleRail = () => {
        setRail(!rail);
        writeFlag(railKey, !rail);
    };

    // Close the drawer when one of its links navigates, or on Escape.
    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!open) return;

        const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', close);

        return () => window.removeEventListener('keydown', close);
    }, [open]);

    return (
        <div className={cn('min-h-dvh lg:flex', className)}>
            <SpinnerOverlay visible={model.signingOut} fixed />
            <header className='sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/90 px-4 text-sidebar-foreground backdrop-blur lg:hidden'>
                <PanelLink destination={{ to: '/' }} className='min-w-0 flex-1 text-foreground no-underline'>
                    <Brand brand={brand} className='[&_img]:h-8 [&_svg]:text-primary' />
                </PanelLink>
                <button
                    type='button'
                    aria-expanded={open}
                    aria-controls='nightfall-sidebar'
                    onClick={() => setOpen(true)}
                    className={iconButtonClass}
                >
                    <Menu aria-hidden className='size-5' />
                    <span className='sr-only'>Menu</span>
                </button>
            </header>
            {open && (
                <button
                    type='button'
                    tabIndex={-1}
                    aria-label='Close the menu'
                    onClick={() => setOpen(false)}
                    className='fixed inset-0 z-40 cursor-default border-0 bg-background/60 p-0 backdrop-blur-sm lg:hidden'
                />
            )}
            <aside
                id='nightfall-sidebar'
                data-rail={rail || undefined}
                className={cn(
                    'group/sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
                    'transition-[translate,visibility,width] duration-200 motion-reduce:transition-none',
                    'lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:max-w-none lg:shrink-0 lg:visible lg:translate-x-0',
                    rail ? 'lg:w-18' : 'lg:w-sidebar',
                    open ? 'visible translate-x-0' : 'invisible -translate-x-full'
                )}
            >
                <button
                    type='button'
                    onClick={toggleRail}
                    aria-controls='nightfall-sidebar'
                    aria-expanded={!rail}
                    title={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
                    className={cn(
                        'absolute top-6 -right-3 z-10 hidden size-6 cursor-pointer items-center justify-center rounded-full border border-sidebar-border',
                        'bg-sidebar p-0 text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:flex'
                    )}
                >
                    {rail ? <ChevronRight aria-hidden className='size-3.5' /> : <ChevronLeft aria-hidden className='size-3.5' />}
                    <span className='sr-only'>{rail ? 'Expand the sidebar' : 'Collapse the sidebar'}</span>
                </button>
                {/* The brand stays put beside the fold button, so the scrollbar below never runs under it. */}
                <div className='flex items-center gap-2 px-4 pt-4 pb-2 lg:group-data-rail/sidebar:px-3'>
                    <PanelLink
                        destination={{ to: '/' }}
                        title={rail ? brand.name : undefined}
                        className={cn(
                            'flex min-w-0 flex-1 rounded-lg px-2 py-1 text-foreground no-underline focus-visible:outline-2 focus-visible:outline-ring',
                            railCentered
                        )}
                    >
                        <Brand
                            brand={brand}
                            className='[&_svg]:text-primary'
                            nameClassName={railSrOnly}
                            logoClassName='lg:group-data-rail/sidebar:h-8 lg:group-data-rail/sidebar:max-w-10'
                        />
                    </PanelLink>
                    <button type='button' onClick={() => setOpen(false)} className={cn(iconButtonClass, 'lg:hidden')}>
                        <X aria-hidden className='size-5' />
                        <span className='sr-only'>Close the menu</span>
                    </button>
                </div>
                <div
                    className={cn(
                        'flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-4 lg:group-data-rail/sidebar:px-3',
                        scrollerClass
                    )}
                >
                    <View name='app.search' />
                    {/* In an area its own pages come first, so a server's console and state are in view at once. */}
                    <AreaNav area={model.area} rail={rail} />
                    <MainLinks model={model} foldable={model.area.kind !== 'dashboard'} rail={rail} />
                </div>
                <div className='flex items-center gap-2 border-t border-sidebar-border p-3 lg:group-data-rail/sidebar:flex-col lg:group-data-rail/sidebar:px-2'>
                    <PanelLink
                        destination={account?.destination ?? { to: '/account' }}
                        title={rail ? user.username : undefined}
                        className='flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-foreground no-underline hover:bg-popover/70 lg:group-data-rail/sidebar:flex-none'
                    >
                        <span className='flex size-9 shrink-0 overflow-hidden rounded-full ring-2 ring-border'>
                            <Avatar name={user.uuid} image={user.avatar} size={36} />
                        </span>
                        <span className={cn('min-w-0 flex-1', railSrOnly)}>
                            <span className='block truncate text-sm font-semibold'>{user.username}</span>
                            <span className='block truncate text-xs text-muted-foreground'>{user.email}</span>
                        </span>
                    </PanelLink>
                    {model.setScheme && <SchemeMenu model={model} setScheme={model.setScheme} />}
                    <button type='button' onClick={model.signOut} className={iconButtonClass}>
                        <LogOut aria-hidden className='size-4' />
                        <span className='sr-only'>Sign out</span>
                    </button>
                </div>
            </aside>
            {/*
              * flow-root keeps the page's top margin inside this box (on phones it is no flex item), so the
              * glow starts at its top; the glow's centre sits above it, so it fades in with no edge.
              */}
            <div className='relative flow-root min-w-0 flex-1'>
                <div
                    aria-hidden
                    className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-radial-[ellipse_at_50%_-25%] from-primary/12 to-transparent to-65%'
                />
                <Main className='min-w-0'>{children}</Main>
            </div>
        </div>
    );
}
