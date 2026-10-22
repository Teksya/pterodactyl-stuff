import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, httpErrorToHuman, type RouteSlotData } from '@pterodactyl/sdk';
import { loginOptions, passwordlessLogin } from './api';
import { ceremonyError, credentialJson, isCancelled, redirectTarget, requestOptions, supportsWebAuthn } from './webauthn';

/** "Sign in with a security key" under the login form: a passkey stands for the password and the second factor. */
export default function PasswordlessButton({ data }: { data: RouteSlotData }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!supportsWebAuthn()) return null;

    const signIn = async () => {
        setBusy(true);
        setError(null);

        try {
            const options = await loginOptions();
            const credential = await navigator.credentials.get({ publicKey: requestOptions(options) });
            if (!(credential instanceof PublicKeyCredential)) throw new DOMException('No credential.', 'NotAllowedError');

            const result = await passwordlessLogin(credentialJson(credential));
            if (result.complete) {
                window.location.assign(redirectTarget(data.search, result.intended));

                return;
            }
        } catch (caught) {
            if (!isCancelled(caught)) setError(caught instanceof DOMException ? ceremonyError(caught) : httpErrorToHuman(caught));
        }

        setBusy(false);
    };

    return (
        <div className='sk:mt-4 sk:flex sk:w-full sk:flex-col sk:items-center sk:gap-2'>
            <Button type='button' isSecondary size='xlarge' className='sk:w-full' onClick={() => void signIn()} isLoading={busy}>
                <KeyRound className='sk:mr-2 sk:size-4' aria-hidden />
                Sign in with a security key
            </Button>
            {error && (
                <p role='alert' className='sk:text-sm sk:text-destructive'>
                    {error}
                </p>
            )}
        </div>
    );
}
