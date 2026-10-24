import { useMemo } from 'react';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import { useLayout } from './api';
import { organize } from './organize';

/**
 * A layer over the app frame: in the admin area, the navigation the theme's shell draws (such as
 * Nightfall's sidebar) comes in the administrators' folders, as `group`s, in their order.
 */
export default function AppLayout({ model, Default, className, children }: ViewProps<'layout.app'>) {
    const area = model.area;
    const { layout } = useLayout(area.kind === 'admin');

    const organized = useMemo(
        () => (area.kind === 'admin' ? { ...model, area: { ...area, nav: { ...area.nav, items: organize(area.nav.items, layout) } } } : model),
        [model, area, layout]
    );

    return (
        <Default model={organized} className={className}>
            {children}
        </Default>
    );
}
