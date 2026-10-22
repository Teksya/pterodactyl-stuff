import { Search as SearchIcon, SearchX, Server } from 'lucide-react';
import {
    Alert,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    InputSpinner,
    PanelLink,
} from '@pterodactyl/sdk';
import { cn, type AppSearchModel, type ViewProps } from '@pterodactyl/sdk/theme';
import Field from './Field';

function Results({ model }: { model: AppSearchModel }) {
    if (model.error) {
        return (
            <div className='mt-4'>
                <Alert type='danger'>{model.error}</Alert>
            </div>
        );
    }

    if (model.searched && model.results.length === 0) {
        return (
            <Empty size='compact' className='mt-6'>
                <EmptyHeader>
                    <EmptyMedia variant='icon'>
                        <SearchX />
                    </EmptyMedia>
                    <EmptyTitle>No servers found</EmptyTitle>
                    <EmptyDescription>No servers match your search. Try a different name or address.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    if (model.results.length === 0) return null;

    return (
        <ul className='mt-6 flex flex-col gap-2'>
            {model.results.map((result) => (
                <li key={result.uuid}>
                    <PanelLink
                        destination={result.destination}
                        onClick={model.close}
                        className={cn(
                            'flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 text-foreground no-underline',
                            'transition-colors hover:border-primary/50 hover:bg-popover'
                        )}
                    >
                        <span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25'>
                            <Server aria-hidden className='size-4' />
                        </span>
                        <span className='min-w-0 flex-1'>
                            <span className='block truncate text-sm font-medium'>{result.name}</span>
                            <span className='block truncate text-xs text-muted-foreground'>{result.addresses.join(', ')}</span>
                        </span>
                        <span className='shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent'>
                            {result.node}
                        </span>
                    </PanelLink>
                </li>
            ))}
        </ul>
    );
}

/** The sidebar's search field, which opens the panel's server search in a dialog. */
export default function Search({ model, className }: ViewProps<'app.search'>) {
    return (
        <>
            {model.open && (
                <Dialog title='Search servers' open onClose={model.close}>
                    <form noValidate onSubmit={(event) => event.preventDefault()}>
                        <InputSpinner visible={model.loading}>
                            <Field
                                field={model.field}
                                label='Search term'
                                icon={SearchIcon}
                                description='Enter a server name, uuid, or allocation to begin searching.'
                                autoFocus
                            />
                        </InputSpinner>
                    </form>
                    <Results model={model} />
                </Dialog>
            )}
            <button
                type='button'
                title='Search'
                aria-keyshortcuts={model.shortcut.aria}
                onClick={model.show}
                className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-background/60 px-3 py-2 text-sm',
                    // Folded into the sidebar's rail, only the icon shows.
                    'lg:group-data-rail/sidebar:justify-center lg:group-data-rail/sidebar:px-0',
                    'text-muted-foreground ring-1 ring-border transition-colors',
                    'hover:bg-popover/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
                    className
                )}
            >
                <SearchIcon aria-hidden className='size-4 shrink-0' />
                <span className='flex-1 text-left lg:group-data-rail/sidebar:sr-only'>Search</span>
                <kbd className='rounded-md bg-popover px-1.5 py-0.5 font-sans text-[0.6875rem] ring-1 ring-border lg:group-data-rail/sidebar:hidden'>{model.shortcut.label}</kbd>
            </button>
        </>
    );
}
