import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, httpErrorToHuman, type RouteSlotData } from '@pterodactyl/sdk';
import { answerCheckpoint, checkpointOptions } from './api';
import { ceremonyError, credentialJson, isCancelled, redirectTarget, requestOptions, supportsWebAuthn } from './webauthn';

/** The login page hands the checkpoint its confirmation token in history state. */
export function confirmationToken(): string {
    const state: unknown = window.history.state;
    const token = state && typeof state === 'object' ? (state as Record<string, unknown>).token : undefined;

    return typeof token === 'string' ? token : '';
}

type Status = { kind: 'loading' } | { kind: 'none' } | { kind: 'ready'; onlyMethod: boolean } | { kind: 'busy' };

/** "Use a security key" under the panel's checkpoint form, for accounts that have one. */
export default function CheckpointKey({ data }: { data: RouteSlotData }) {
    const token = confirmationToken();
    const [status, setStatus] = useState<Status>({ kind: 'loading' });
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    const useKey = useCallback(async () => {
        setError(null);
        setStatus({ kind: 'busy' });

        let onlyMethod = false;
        try {
            // A challenge is good for one attempt, so every attempt asks for a fresh one.
            const options = await checkpointOptions(token);
            if (!options) return setStatus({ kind: 'none' });
            onlyMethod = options.only_method;

            const credential = await navigator.credentials.get({ publicKey: requestOptions(options.public_key) });
            if (!(credential instanceof PublicKeyCredential)) throw new DOMException('No credential.', 'NotAllowedError');

            const result = await answerCheckpoint(token, credentialJson(credential));
            if (result.complete) {
                window.location.assign(redirectTarget(data.search, result.intended));

                return;
            }
        } catch (caught) {
            setError(caught instanceof DOMException ? ceremonyError(caught) : httpErrorToHuman(caught));
            if (isCancelled(caught)) setError(null);
        }

        setStatus({ kind: 'ready', onlyMethod });
    }, [token, data.search]);

    useEffect(() => {
        if (!token || !supportsWebAuthn()) return setStatus({ kind: 'none' });

        let cancelled = false;
        checkpointOptions(token)
            .then((options) => {
                if (cancelled) return;
                if (!options) return setStatus({ kind: 'none' });

                setStatus({ kind: 'ready', onlyMethod: options.only_method });
                // A key is the only second factor of this account: ask for it straight away.
                if (options.only_method && !started.current) {
                    started.current = true;
                    void useKey();
                }
            })
            .catch(() => !cancelled && setStatus({ kind: 'none' }));

        return () => {
            cancelled = true;
        };
    }, [token, useKey]);

    if (status.kind === 'none' || status.kind === 'loading') return null;

    return (
        <div className='sk:mx-auto sk:mt-4 sk:flex sk:w-full sk:max-w-md sk:flex-col sk:items-center sk:gap-2 sk:text-center'>
            {status.kind === 'ready' && status.onlyMethod && (
                <p className='sk:text-sm sk:text-muted-foreground'>
                    This account is protected by a security key. Insert or tap your key to continue.
                </p>
            )}
            <Button type='button' size='xlarge' onClick={() => void useKey()} isLoading={status.kind === 'busy'}>
                <KeyRound className='sk:mr-2 sk:size-4' aria-hidden />
                Use a security key
            </Button>
            {error && (
                <p role='alert' className='sk:text-sm sk:text-destructive'>
                    {error}
                </p>
            )}
        </div>
    );
}
