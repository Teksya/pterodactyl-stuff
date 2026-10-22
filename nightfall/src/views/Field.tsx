import { useId, useState, type ReactNode } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Input, Label, type FieldModel } from '@pterodactyl/sdk';
import { cn } from '@pterodactyl/sdk/theme';

interface Props {
    field: FieldModel;
    label: string;
    icon?: LucideIcon;
    description?: string;
    /** Placed at the end of the label row, such as a "Forgot password?" link. */
    action?: ReactNode;
    /** Adds a button that shows the password as text. */
    revealable?: boolean;
    title?: string;
    autoFocus?: boolean;
    inputClassName?: string;
}

/** Label, input and help text for an engine field, whose own props pass through untouched. */
export default function Field({ field, label, icon: Icon, description, action, revealable, title, autoFocus, inputClassName }: Props) {
    const id = useId();
    const helpId = `${id}-help`;
    const [revealed, setRevealed] = useState(false);
    const help = field.error ?? description;

    return (
        <div>
            <div className='mb-1.5 flex items-baseline justify-between gap-3'>
                <Label htmlFor={id} className='mb-0 text-sm font-medium normal-case text-foreground'>
                    {label}
                </Label>
                {action && <span className='text-sm'>{action}</span>}
            </div>
            <div className='relative'>
                {Icon && (
                    <Icon
                        aria-hidden
                        className='pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground'
                    />
                )}
                <Input
                    {...field.fieldProps}
                    type={revealable && revealed ? 'text' : field.fieldProps.type}
                    id={id}
                    title={title}
                    autoFocus={autoFocus}
                    aria-invalid={field.error ? true : undefined}
                    aria-describedby={help ? helpId : undefined}
                    $hasError={!!field.error}
                    className={cn('rounded-lg', Icon && 'pl-10', revealable && 'pr-11', inputClassName)}
                />
                {revealable && (
                    <button
                        type='button'
                        onClick={() => setRevealed(!revealed)}
                        disabled={field.fieldProps.disabled}
                        aria-label={revealed ? 'Hide password' : 'Show password'}
                        aria-pressed={revealed}
                        aria-controls={id}
                        className='absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50'
                    >
                        {revealed ? <EyeOff aria-hidden className='size-4' /> : <Eye aria-hidden className='size-4' />}
                    </button>
                )}
            </div>
            {help && (
                <p id={helpId} className={cn('mt-1.5 text-xs', field.error ? 'text-destructive' : 'text-muted-foreground')}>
                    {help}
                </p>
            )}
        </div>
    );
}
