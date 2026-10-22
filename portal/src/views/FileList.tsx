import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * Classic's file rows, gathered into one card with hairlines between them instead of a stack of
 * separate bars. Each row keeps classic's markup, handlers and hover fill; only its frame changes.
 */
const listClass = [
    'overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm',
    '[&>*]:mb-0 [&>*]:rounded-none [&>*]:bg-transparent [&>*]:transition-colors',
    '[&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border/50',
].join(' ');

export default function FileList({ Default, className }: ViewProps<'server.files.manager.list'>) {
    return <Default className={cn(listClass, className)} />;
}
