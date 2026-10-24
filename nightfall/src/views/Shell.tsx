import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { Avatar, PanelLink, SpinnerOverlay, usePanelLocation } from '@pterodactyl/sdk';
import { Main, View, cn, type ViewProps } from '@pterodactyl/sdk/theme';
import Brand from './Brand';
import AreaNav from './sidebar/AreaNav';
import MainLinks from './sidebar/MainLinks';
import SchemeMenu from './sidebar/SchemeMenu';
import { readFlag, writeFlag } from './sidebar/storage';
import { iconButtonClass, railCentered, railSrOnly, scrollerClass } from './sidebar/styles';

const railKey = 'nightfall.sidebar.rail';

/** A sidebar beside the page on large screens, and a drawer behind a menu button below them. */
export default function Shell({ model, className, children }: ViewProps<'layout.app'>) {
    const { brand, user } = model;
    const account = model.links.find((link) => link.id === 'account');
    const [open, setOpen] = useState(false);
    const menuButton = useRef<HTMLButtonElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const [rail, setRail] = useState(() => readFlag(railKey));
    const { pathname } = usePanelLocation();
    const toggleRail = () => {
        setRail(!rail);
        writeFlag(railKey, !rail);
    };

    // Close the drawer when one of its links navigates, or on Escape.
    useEffect(() => setOpen(false), [pathname]);
    // While open, the drawer holds the focus and the page behind it stays still; closing gives the focus back.
    useEffect(() => {
        if (!open) return;

        const close = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
        const overflow = document.body.style.overflow;
        window.addEventListener('keydown', close);
        document.body.style.overflow = 'hidden';
        closeButton.current?.focus();

        return () => {
            window.removeEventListener('keydown', close);
            document.body.style.overflow = overflow;
            menuButton.current?.focus();
        };
    }, [open]);

    return (
        <div className={cn('min-h-dvh lg:flex', className)}>
            <SpinnerOverlay visible={model.signingOut} fixed />
            <header className='sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/90 px-4 text-sidebar-foreground backdrop-blur lg:hidden'>
                <PanelLink destination={{ to: '/' }} className='min-w-0 flex-1 text-foreground no-underline'>
                    <Brand brand={brand} className='[&_img]:h-8 [&_svg]:text-primary' />
                </PanelLink>
                <button
                    ref={menuButton}
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
                    // Above the page column, which would otherwise take the clicks on the outer half of the fold button.
                    'lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:max-w-none lg:shrink-0 lg:visible lg:translate-x-0',
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
                    <button ref={closeButton} type='button' onClick={() => setOpen(false)} className={cn(iconButtonClass, 'lg:hidden')}>
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
                    <AreaNav key={model.area.kind} area={model.area} rail={rail} />
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
