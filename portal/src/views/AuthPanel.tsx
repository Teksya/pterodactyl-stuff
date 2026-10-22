import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, Form, PanelLink, type CorePanelDestination } from '@pterodactyl/sdk';
import { cn } from '@pterodactyl/sdk/theme';

interface Props {
    icon: LucideIcon;
    title: string;
    description: ReactNode;
    submit: () => void;
    className?: string;
    children: ReactNode;
    footer?: ReactNode;
}

/** A sign-in form under its icon, title and description; `className` lands on its outer element. */
export default function AuthPanel({ icon: Icon, title, description, submit, className, children, footer }: Props) {
    return (
        <div className={cn('animate-rise motion-reduce:animate-none', className)}>
            <div className='flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25'>
                <Icon aria-hidden className='size-5' />
            </div>
            <h1 className='mt-6 font-header text-2xl font-semibold tracking-tight text-foreground sm:text-3xl'>
                {title}
            </h1>
            <p className='mt-2 text-sm text-muted-foreground'>{description}</p>
            <Form form={{ handleSubmit: submit }} className='mt-8 flex flex-col gap-5'>
                {children}
            </Form>
            {footer && <div className='mt-8 flex flex-col items-center gap-3 text-sm'>{footer}</div>}
        </div>
    );
}

/** The full-width submit button of a sign-in form. */
export function SubmitButton({ disabled, loading, children }: { disabled: boolean; loading: boolean; children: ReactNode }) {
    return (
        <Button
            type='submit'
            size='large'
            disabled={disabled}
            isLoading={loading}
            className='mt-1 w-full rounded-lg py-3 font-medium normal-case tracking-normal'
        >
            {children}
        </Button>
    );
}

export const linkClass =
    'font-medium text-primary no-underline hover:underline underline-offset-4 focus-visible:underline';

/** A quiet link back to the login page, under the form. */
export function BackToLogin({ destination }: { destination: CorePanelDestination }) {
    return (
        <PanelLink
            destination={destination}
            className='inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground'
        >
            <span aria-hidden>&larr;</span> Back to login
        </PanelLink>
    );
}
