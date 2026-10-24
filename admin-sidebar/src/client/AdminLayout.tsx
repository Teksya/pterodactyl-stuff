import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Menu } from 'lucide-react';
import { cn, Icon, NavigationLabel, usePanelLocation } from '@pterodactyl/sdk';
import { Main, Navigation, NavigationLink, Slot, useActiveNavItem, useTheme, type NavItem, type ViewProps } from '@pterodactyl/sdk/theme';
import { useLayout } from './api';
import { organize, sections, type Section } from './organize';

const FOLDED_KEY = 'admin-sidebar:folded';

const readFolded = (): string[] => {
    try {
        const value = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');

        return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
};

/** The folders folded in this browser, by id. */
function useFolded() {
    const [folded, setFolded] = useState(readFolded);
    const toggle = (id: string) =>
        setFolded((current) => {
            const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
            try {
                localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
            } catch {
                // Without storage, folding lasts until the page reloads.
            }

            return next;
        });

    return { folded, toggle };
}

// Classic's own sidebar classes, under this extension's prefix.
const itemClass = [
    'as:flex as:items-center as:gap-3 as:rounded-md as:px-3 as:py-2 as:text-sm as:no-underline',
    'as:text-muted-foreground as:transition-colors as:duration-150',
    'as:hover:bg-card as:hover:text-foreground as:active:bg-popover/80',
    'as:data-[status=active]:bg-popover as:data-[status=active]:text-foreground',
].join(' ');

const slotClass = [
    'as:contents',
    'as:[&_a]:flex as:[&_a]:items-center as:[&_a]:gap-3 as:[&_a]:rounded-md as:[&_a]:py-2 as:[&_a]:pr-3 as:[&_a]:pl-10 as:[&_a]:text-sm as:[&_a]:no-underline',
    'as:[&_a]:text-muted-foreground as:[&_a]:transition-colors as:[&_a]:duration-150',
    'as:[&_a:hover]:bg-card as:[&_a:hover]:text-foreground',
    'as:[&_a[data-status=active]]:bg-popover as:[&_a[data-status=active]]:text-foreground',
].join(' ');

function FolderHeading({ section, open, onToggle }: { section: Section; open: boolean; onToggle: () => void }) {
    const Chevron = open ? ChevronDown : ChevronRight;

    return (
        <button
            type='button'
            aria-expanded={open}
            onClick={onToggle}
            className='as:mt-3 as:flex as:w-full as:cursor-pointer as:items-center as:gap-2 as:rounded-md as:border-0 as:bg-transparent as:px-3 as:py-1.5 as:text-left as:text-xs as:font-semibold as:tracking-wide as:text-muted-foreground as:uppercase as:hover:text-foreground'
        >
            <Chevron className='as:size-3.5 as:shrink-0' aria-hidden />
            <span className='as:min-w-0 as:flex-1 as:truncate'>{section.folder?.name}</span>
            <span className='as:font-normal as:normal-case as:opacity-70'>{section.items.length}</span>
        </button>
    );
}

/** Classic's admin sidebar, with the administrators' folders folding. */
function ClassicSidebar({ items, all }: { items: NavItem[]; all: Section[] }) {
    const [open, setOpen] = useState(false);
    const { pathname } = usePanelLocation();
    const current = useActiveNavItem(items);
    const { folded, toggle } = useFolded();

    useEffect(() => setOpen(false), [pathname]);

    return (
        <div className='as:w-full as:shrink-0 as:px-4 as:pt-4 as:lg:w-sidebar as:lg:px-0 as:lg:pt-0'>
            <button
                type='button'
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls='admin-sidebar-nav'
                className='as:flex as:w-full as:items-center as:gap-3 as:rounded-md as:bg-card as:px-3 as:py-2 as:text-sm as:text-foreground as:shadow-sm as:transition-colors as:duration-150 as:hover:bg-popover as:lg:hidden'
            >
                <Icon icon={Menu} className='as:size-4 as:shrink-0' />
                <span className='as:min-w-0 as:flex-1 as:truncate as:text-left'>{current?.label ?? 'Administration'}</span>
                <Icon icon={ChevronDown} className={cn('as:size-4 as:shrink-0 as:transition-transform', open && 'as:rotate-180')} />
            </button>
            <nav
                id='admin-sidebar-nav'
                aria-label='Administration'
                className={cn(
                    'as:mt-2 as:flex-col as:gap-0.5',
                    'as:lg:sticky as:lg:top-0 as:lg:mt-0 as:lg:flex as:lg:max-h-dvh as:lg:overflow-y-auto as:lg:px-4 as:lg:py-6',
                    open ? 'as:flex' : 'as:hidden'
                )}
            >
                <div className={slotClass}>
                    <Slot name='panel.navigation.before' />
                </div>
                {all.map((section) => {
                    // The folder of the page in view stays open.
                    const holdsCurrent = current !== undefined && section.items.some((item) => item.id === current.id && item.extensionId === current.extensionId);
                    const shown = section.folder === null || holdsCurrent || !folded.includes(section.folder.id);

                    return (
                        <div key={section.folder?.id ?? 'top'} className='as:flex as:flex-col as:gap-0.5'>
                            {section.folder && <FolderHeading section={section} open={shown} onToggle={() => toggle(section.folder!.id)} />}
                            {shown && (
                                <Navigation items={section.items}>
                                    {(item, state) => (
                                        <NavigationLink item={item} className={cn(itemClass, section.folder && 'as:pl-5')}>
                                            <NavigationLabel label={item.label} icon={item.icon ?? 'puzzle'} badge={state.badge} />
                                        </NavigationLink>
                                    )}
                                </Navigation>
                            )}
                        </div>
                    );
                })}
                <div className={slotClass}>
                    <Slot name='panel.navigation.after' />
                </div>
            </nav>
        </div>
    );
}

/**
 * A layer over the admin area's frame. Classic draws a flat list, so on classic this layer draws
 * the sidebar itself, with folders that fold; any other theme gets the navigation in folders, as
 * `group`s, and draws it its own way (Nightfall folds them too).
 */
export default function AdminLayout({ model, Default, className, children }: ViewProps<'layout.admin'>) {
    const { id } = useTheme();
    const { layout } = useLayout();
    const items = model.nav.items;
    const all = useMemo(() => sections(items, layout), [items, layout]);
    const organized = useMemo(() => ({ ...model, nav: { ...model.nav, items: organize(items, layout) } }), [model, items, layout]);

    if (id !== 'classic') {
        return (
            <Default model={organized} className={className}>
                {children}
            </Default>
        );
    }

    return (
        <div className={cn('as:mx-auto as:flex as:w-full as:max-w-panel as:flex-col as:lg:flex-row', className)}>
            <ClassicSidebar items={organized.nav.items} all={all} />
            <div className='as:min-w-0 as:flex-1 as:xl:pl-4'>
                <Main>{children}</Main>
            </div>
        </div>
    );
}
