import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PanelLink } from '@pterodactyl/sdk';
import { Slot, cn, type AppLayoutModel } from '@pterodactyl/sdk/theme';
import NavIcon from '../NavIcon';
import { readFlag, writeFlag } from './storage';
import { headingClass, itemClass, railHidden, railSrOnly } from './styles';

const linksKey = 'nightfall.sidebar.links-collapsed';

/**
 * The dashboard, admin and account links with the slots around them. Inside an area they sit at the
 * foot of the sidebar, under the area's own pages, and fold away behind their heading.
 */
export default function MainLinks({ model, foldable, rail }: { model: AppLayoutModel; foldable: boolean; rail: boolean }) {
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
