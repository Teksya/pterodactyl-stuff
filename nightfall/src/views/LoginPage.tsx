import { Lock, LogIn, User } from 'lucide-react';
import { PanelLink, type ViewProps } from '@pterodactyl/sdk';
import { Slot } from '@pterodactyl/sdk/theme';
import AuthPanel, { SubmitButton, linkClass } from './AuthPanel';
import Field from './Field';

export default function LoginPage({ model, className }: ViewProps<'page.auth.login'>) {
    const { fields, Captcha } = model;

    return (
        <AuthPanel
            icon={LogIn}
            title='Welcome back'
            description='Sign in to manage your servers.'
            submit={model.submit}
            className={className}
        >
            <Field field={fields.username} label='Username or email' icon={User} autoFocus />
            <Field
                field={fields.password}
                label='Password'
                icon={Lock}
                revealable
                action={
                    <PanelLink destination={model.forgotPassword} className={linkClass}>
                        Forgot password?
                    </PanelLink>
                }
            />
            <SubmitButton disabled={!model.canSubmit} loading={model.submitting}>
                Sign in
            </SubmitButton>
            <Slot name='auth.login.form.after' data={model.route} />
            {Captcha && <Captcha />}
        </AuthPanel>
    );
}
