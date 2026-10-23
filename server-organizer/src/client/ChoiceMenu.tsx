import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '@pterodactyl/sdk';
import { useSkin } from '@pterodactyl/sdk/theme';

/**
 * One of a few fixed choices, such as how to group: a button naming the current one and a menu
 * with it checked, as the panel's own scheme menu. A select would be a search box for three words.
 */
export default function ChoiceMenu<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    const button = useSkin('Button', { color: 'grey', size: 'small', secondary: true, loading: false });
    const current = options.find((option) => option.value === value);

    return (
        <DropdownMenu
            triggerClassName={button.classes('root', 'so:inline-flex so:items-center so:gap-1.5 so:whitespace-nowrap')}
            triggerContent={
                <>
                    <span className='so:text-muted-foreground'>{label}:</span>
                    <span>{current?.label}</span>
                    <ChevronDown className='so:size-3.5' aria-hidden />
                </>
            }
        >
            {options.map((option) => (
                <DropdownMenuItem key={option.value} checked={option.value === value} onClick={() => onChange(option.value)}>
                    {option.label}
                </DropdownMenuItem>
            ))}
        </DropdownMenu>
    );
}
