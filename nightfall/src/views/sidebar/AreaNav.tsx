import { ChevronDown } from 'lucide-react';
import {
    Navigation,
    NavigationLink,
    Slot,
    cn,
    useActiveNavItem,
    type AccountArea,
    type AdminArea,
    type AppArea,
    type NavItem,
    type ServerArea,
} from '@pterodactyl/sdk/theme';
import NavIcon from '../NavIcon';
import ServerSwitcher, { states } from '../ServerSwitcher';
import { useStoredList } from './storage';
import { headingClass, itemClass, railHidden, railSrOnly } from './styles';

type Area = AccountArea | ServerArea | AdminArea;

/** The slots of an area's navigation, which its own layout renders in classic. */
function AreaSlot({ area, at, compact }: { area: Area; at: 'before' | 'after'; compact: boolean }) {
    if (area.kind === 'server') return <Slot name={`server.navigation.${at}`} data={area.server} compact={compact} />;
    if (area.kind === 'account') return <Slot name={`account.navigation.${at}`} compact={compact} />;

    return <Slot name={`panel.navigation.${at}`} compact={compact} />;
}

const noItems: readonly NavItem[] = [];

/**
 * The pages of the area the user is in. Where a group of items starts, a heading that folds the
 * group; the group of the page in view stays open, and the rail shows every item.
 */
export default function AreaNav({ area, rail }: { area: AppArea; rail: boolean }) {
    const items: readonly NavItem[] =
        area.kind === 'dashboard' ? noItems : area.kind === 'server' && area.adminLink ? [...area.nav.items, area.adminLink] : area.nav.items;
    const current = useActiveNavItem(items);
    // Shell keys this by area, so each area reads its own folded groups.
    const [folded, toggle] = useStoredList(`nightfall:folded-groups:${area.kind}`);

    if (area.kind === 'dashboard') return null;

    const label = { server: 'Server', account: 'Account', admin: 'Administration' }[area.kind];
    const groupStarts = new Set(items.filter((item, index) => item.group && item.group !== items[index - 1]?.group));
    const state = area.kind === 'server' && area.state ? states[area.state] : null;
    const isFolded = (group: string | null) => !rail && group !== null && group !== current?.group && folded.includes(group);

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
                        {groupStarts.has(item) && item.group && (
                            <>
                                <button
                                    type='button'
                                    aria-expanded={!isFolded(item.group)}
                                    onClick={() => toggle(item.group!)}
                                    className={cn(
                                        headingClass,
                                        'mt-3 flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent pt-0 text-left hover:text-foreground',
                                        railHidden
                                    )}
                                >
                                    <span className='min-w-0 flex-1 truncate'>{item.group}</span>
                                    <ChevronDown aria-hidden className={cn('size-3.5 shrink-0 transition-transform', isFolded(item.group) && '-rotate-90')} />
                                </button>
                                <hr aria-hidden className='mx-2 my-2 hidden border-sidebar-border lg:group-data-rail/sidebar:block' />
                            </>
                        )}
                        {!isFolded(item.group) && (
                            <NavigationLink item={item} title={rail ? item.label : undefined} className={itemClass}>
                                <NavIcon name={item.icon} />
                                <span className={cn('min-w-0 flex-1 truncate', railSrOnly)}>{item.label}</span>
                                <span className={railHidden}>{badge}</span>
                            </NavigationLink>
                        )}
                    </>
                )}
            </Navigation>
            <div className='min-w-0 overflow-hidden'>
                <AreaSlot area={area} at='after' compact={rail} />
            </div>
        </nav>
    );
}
