import type { ReactNode } from 'react';
import { Main } from '@pterodactyl/sdk/theme';

/** The sidebar draws every area's navigation and its slots, so an area's layout only places its pages. */
export default function AreaLayout({ className, children }: { className?: string; children?: ReactNode }) {
    return <Main className={className}>{children}</Main>;
}
