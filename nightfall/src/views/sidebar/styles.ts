/*
 * Folded into a rail (`data-rail` on the sidebar, from the `lg` breakpoint), the sidebar keeps its
 * icons, the mark and the avatar: labels stay for screen readers, headings and the rest go.
 */
export const railSrOnly = 'lg:group-data-rail/sidebar:sr-only';
export const railHidden = 'lg:group-data-rail/sidebar:hidden';
export const railCentered = 'lg:group-data-rail/sidebar:justify-center lg:group-data-rail/sidebar:px-0';

/** A link of the sidebar; the active one is tinted with the primary colour, its icon in full. */
export const itemClass = [
    'flex min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline',
    railCentered,
    'text-muted-foreground transition-colors hover:bg-popover/70 hover:text-foreground',
    'data-[status=active]:bg-primary/12 data-[status=active]:text-foreground data-[status=active]:[&_svg]:text-primary',
    'focus-visible:outline-2 focus-visible:outline-ring',
].join(' ');

export const iconButtonClass = [
    'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0',
    'text-muted-foreground transition-colors hover:bg-popover/70 hover:text-foreground',
    'focus-visible:outline-2 focus-visible:outline-ring',
].join(' ');

/** A thin scrollbar that shows only while the pointer is over the sidebar, or focus is in it. */
export const scrollerClass = [
    '[scrollbar-width:thin] [scrollbar-color:transparent_transparent]',
    'group-hover/sidebar:[scrollbar-color:var(--border)_transparent] focus-within:[scrollbar-color:var(--border)_transparent]',
    '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent',
    'group-hover/sidebar:[&::-webkit-scrollbar-thumb]:bg-border',
].join(' ');

export const headingClass = 'px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/70';
