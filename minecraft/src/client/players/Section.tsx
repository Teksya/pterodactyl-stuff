import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@pterodactyl/sdk';

interface Props {
    title: string;
    description?: ReactNode;
    /** Shown at the right of the heading, such as a Refresh button. */
    aside?: ReactNode;
    /** Sections fold, as the Pelican plugin's do, except the first ones. */
    collapsible?: boolean;
    children: ReactNode;
}

/** A titled card of the player's page, with its description under the title. */
export default function Section({ title, description, aside, collapsible = false, children }: Props) {
    const [open, setOpen] = useState(true);
    const id = useId();

    return (
        <section aria-labelledby={id} className='mc:rounded-lg mc:border mc:border-border mc:bg-card'>
            <header className='mc:flex mc:items-start mc:gap-3 mc:px-4 mc:py-3'>
                <div className='mc:min-w-0 mc:flex-1'>
                    <h3 id={id} className='mc:m-0 mc:text-base mc:font-semibold'>
                        {title}
                    </h3>
                    {description && <div className='mc:mt-0.5 mc:text-sm mc:text-muted-foreground'>{description}</div>}
                </div>
                {aside}
                {collapsible && (
                    <button
                        type='button'
                        aria-expanded={open}
                        aria-label={open ? `Fold ${title}` : `Unfold ${title}`}
                        onClick={() => setOpen(!open)}
                        className='mc:flex mc:size-7 mc:shrink-0 mc:cursor-pointer mc:items-center mc:justify-center mc:rounded-md mc:border-0 mc:bg-transparent mc:text-muted-foreground mc:hover:bg-secondary mc:hover:text-foreground'
                    >
                        <ChevronDown aria-hidden className={cn('mc:size-4 mc:transition-transform', !open && 'mc:-rotate-90')} />
                    </button>
                )}
            </header>
            {open && <div className='mc:border-t mc:border-border mc:p-4'>{children}</div>}
        </section>
    );
}

/** A read-only value with its label above, as the plugin shows the player's fields. */
export function ReadField({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
    return (
        <div className='mc:min-w-0'>
            <p className='mc:m-0 mc:mb-1 mc:text-sm mc:font-medium'>{label}</p>
            <div className={cn('mc:flex mc:min-h-9 mc:items-center mc:truncate mc:rounded-md mc:border mc:border-border mc:bg-sunken mc:px-3 mc:text-sm mc:text-muted-foreground', mono && 'mc:font-mono mc:text-xs')}>
                {children ?? '—'}
            </div>
        </div>
    );
}
