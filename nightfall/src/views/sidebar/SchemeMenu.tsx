import { Monitor, Moon, Sun } from 'lucide-react';
import { DropdownMenu } from '@pterodactyl/sdk';
import type { AppLayoutModel } from '@pterodactyl/sdk/theme';
import { iconButtonClass } from './styles';

const schemeIcons = { dark: Moon, light: Sun, system: Monitor } as const;
const schemeLabels = { dark: 'Dark', light: 'Light', system: 'System' } as const;

/** Only rendered when the theme offers more than one scheme. */
export default function SchemeMenu({ model, setScheme }: { model: AppLayoutModel; setScheme: NonNullable<AppLayoutModel['setScheme']> }) {
    const Current = schemeIcons[model.scheme];

    return (
        <DropdownMenu
            triggerClassName={iconButtonClass}
            triggerContent={
                <>
                    <Current aria-hidden className='size-4' />
                    <span className='sr-only'>Color scheme</span>
                </>
            }
        >
            {[...model.schemes, 'system' as const].map((scheme) => (
                <DropdownMenu.Item
                    key={scheme}
                    icon={schemeIcons[scheme]}
                    checked={scheme === model.preference}
                    onClick={() => setScheme(scheme)}
                >
                    {schemeLabels[scheme]}
                </DropdownMenu.Item>
            ))}
        </DropdownMenu>
    );
}
