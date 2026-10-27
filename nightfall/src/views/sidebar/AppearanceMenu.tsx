import { Monitor, Moon, PanelLeft, PanelTop, Sun } from 'lucide-react';
import { DropdownMenu } from '@pterodactyl/sdk';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';
import type { ShellLayout } from './storage';
import { iconButtonClass } from './styles';

const schemeIcons = { dark: Moon, light: Sun, system: Monitor } as const;
const schemeLabels = { dark: 'Dark', light: 'Light', system: 'System' } as const;
const layoutIcons = { sidebar: PanelLeft, topbar: PanelTop } as const;
const layouts = [
    { value: 'sidebar', label: 'Sidebar', description: 'Beside the page' },
    { value: 'topbar', label: 'Top bar', description: 'Above the page, on large screens' },
] as const;

const groupClass = 'm-0 px-2.5 pt-1.5 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/70';

/**
 * The user's own look, kept in their browser: the colour scheme when the theme offers more than
 * one, and where the navigation goes.
 */
export default function AppearanceMenu({ model, layout, setLayout }: { model: AppLayoutModel; layout: ShellLayout; setLayout: (layout: ShellLayout) => void }) {
    const setScheme = model.setScheme;
    const Current = setScheme ? schemeIcons[model.scheme] : layoutIcons[layout];

    return (
        <DropdownMenu
            triggerClassName={iconButtonClass}
            className='w-60'
            triggerContent={
                <>
                    <Current aria-hidden className='size-4' />
                    <span className='sr-only'>Appearance</span>
                </>
            }
        >
            {setScheme && (
                <>
                    <p className={groupClass}>Color scheme</p>
                    {[...model.schemes, 'system' as const].map((scheme) => (
                        <DropdownMenu.Item key={scheme} icon={schemeIcons[scheme]} checked={scheme === model.preference} onClick={() => setScheme(scheme)}>
                            {schemeLabels[scheme]}
                        </DropdownMenu.Item>
                    ))}
                    <hr className='my-1.5 border-0 border-t border-border' />
                </>
            )}
            <p className={groupClass}>Navigation</p>
            {layouts.map(({ value, label, description }) => (
                <DropdownMenu.Item key={value} icon={layoutIcons[value]} description={description} checked={value === layout} onClick={() => setLayout(value)}>
                    {label}
                </DropdownMenu.Item>
            ))}
        </DropdownMenu>
    );
}
