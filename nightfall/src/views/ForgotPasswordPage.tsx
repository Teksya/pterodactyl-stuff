import { KeyRound, Mail } from 'lucide-react';
import type { ViewProps } from '@pterodactyl/sdk';
import AuthPanel, { BackToLogin, SubmitButton } from './AuthPanel';
import Field from './Field';

export default function ForgotPasswordPage({ model, className }: ViewProps<'page.auth.password'>) {
    const { Captcha } = model;

    return (
        <AuthPanel
            icon={KeyRound}
            title='Forgot your password?'
            description="Enter your account's email address and we will send you a link to reset it."
            submit={model.submit}
            className={className}
            footer={<BackToLogin destination={model.login} />}
        >
            <Field field={model.fields.email} label='Email' icon={Mail} autoFocus />
            <SubmitButton disabled={!model.canSubmit} loading={model.submitting}>
                Send reset link
            </SubmitButton>
            {Captcha && <Captcha />}
        </AuthPanel>
    );
}
