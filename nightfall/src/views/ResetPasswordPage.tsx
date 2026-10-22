import { useId } from 'react';
import { Lock, LockKeyhole, Mail } from 'lucide-react';
import { Input, Label, type ViewProps } from '@pterodactyl/sdk';
import AuthPanel, { BackToLogin, SubmitButton } from './AuthPanel';
import Field from './Field';

export default function ResetPasswordPage({ model, className }: ViewProps<'page.auth.passwordReset'>) {
    const { fields, Captcha } = model;
    const emailId = useId();

    return (
        <AuthPanel
            icon={LockKeyhole}
            title='Set a new password'
            description='Choose a new password for your account.'
            submit={model.submit}
            className={className}
            footer={<BackToLogin destination={model.login} />}
        >
            <div>
                <Label htmlFor={emailId} className='mb-1.5 text-sm font-medium normal-case text-foreground'>
                    Email
                </Label>
                <div className='relative'>
                    <Mail
                        aria-hidden
                        className='pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground'
                    />
                    {/* Read-only rather than disabled, so password managers file the new password under it. */}
                    <Input
                        id={emailId}
                        value={model.email}
                        readOnly
                        autoComplete='username'
                        className='rounded-lg pl-10 text-muted-foreground'
                    />
                </div>
            </div>
            <Field
                field={fields.password}
                label='New password'
                icon={Lock}
                revealable
                autoFocus
                description='Passwords must be at least 8 characters in length.'
            />
            <Field field={fields.passwordConfirmation} label='Confirm new password' icon={Lock} revealable />
            <SubmitButton disabled={!model.canSubmit} loading={model.submitting}>
                Reset password
            </SubmitButton>
            {Captcha && <Captcha />}
        </AuthPanel>
    );
}
