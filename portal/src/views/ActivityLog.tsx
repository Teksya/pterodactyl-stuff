import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * Classic's activity log, its entries gathered into a rounded card with hairlines between them and a
 * hover fill. Classic draws the list as a `bg-card` box of rows split by `border-b-2`.
 */
const logClass = [
    '[&_.bg-card]:overflow-hidden [&_.bg-card]:rounded-xl [&_.bg-card]:border [&_.bg-card]:border-border/60 [&_.bg-card]:shadow-sm',
    '[&_.border-b-2]:border-b [&_.border-b-2]:border-border/50 [&_.border-b-2]:transition-colors [&_.border-b-2:hover]:bg-popover/40',
].join(' ');

export default function ActivityLog({ Default, className }: ViewProps<'activity.log'>) {
    return <Default className={cn(logClass, className)} />;
}
