import { KeyRound, ShieldCheck } from 'lucide-react';
import type { ViewProps } from '@pterodactyl/sdk';
import AuthPanel, { BackToLogin, SubmitButton, linkClass } from './AuthPanel';
import Field from './Field';

export default function CheckpointPage({ model, className }: ViewProps<'page.auth.checkpoint'>) {
    const { recovery } = model;

    return (
        <AuthPanel
            icon={recovery ? KeyRound : ShieldCheck}
            title={recovery ? 'Use a recovery code' : 'Two-factor authentication'}
            description={
                recovery
                    ? 'Enter one of the recovery codes you saved when you set up two-factor authentication.'
                    : 'Enter the code shown by the authenticator app on your device.'
            }
            submit={model.submit}
            className={className}
            footer={
                <>
                    <button
                        type='button'
                        onClick={model.toggleRecovery}
                        className={`cursor-pointer border-0 bg-transparent p-0 ${linkClass}`}
                    >
                        {recovery ? 'Use my authenticator app' : 'Lost your device? Use a recovery code'}
                    </button>
                    <BackToLogin destination={model.login} />
                </>
            }
        >
            <Field
                // A new input for each mode, so the browser does not offer one kind of code for the other.
                key={recovery ? 'recovery' : 'code'}
                field={model.fields.code}
                label={recovery ? 'Recovery code' : 'Authentication code'}
                icon={recovery ? KeyRound : undefined}
                autoFocus
                inputClassName={
                    recovery
                        ? 'font-mono'
                        : 'py-3.5 text-center font-mono text-xl tracking-[0.5em] indent-[0.5em]'
                }
            />
            <SubmitButton disabled={!model.canSubmit} loading={model.submitting}>
                Continue
            </SubmitButton>
        </AuthPanel>
    );
}
