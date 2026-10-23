import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
    Alert,
    Button,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    PanelLink,
    httpErrorToHuman,
    type RouteSlotData,
} from '@pterodactyl/sdk';
import { answerCheckpoint, checkpointOptions } from './api';
import { ceremonyError, credentialJson, isCancelled, redirectTarget, requestOptions, supportsWebAuthn } from './webauthn';

/** The login page hands the checkpoint its confirmation token in history state. */
export function confirmationToken(): string {
    const state: unknown = window.history.state;
    const token = state && typeof state === 'object' ? (state as Record<string, unknown>).token : undefined;

    return typeof token === 'string' ? token : '';
}

/** How many levels above the slot the panel's checkpoint form is looked for. */
const VIEW_DEPTH = 4;

/**
 * The panel's checkpoint view beside this slot: the closest siblings, going up from the slot,
 * that hold a form. Empty when the slot sits inside the form, where it cannot stand in for it.
 */
function checkpointView(slot: HTMLElement): HTMLElement[] {
    if (slot.closest('form')) return [];

    let node = slot;
    for (let depth = 0; depth < VIEW_DEPTH && node.parentElement && node.parentElement !== document.body; depth++) {
        const view = [...node.parentElement.children].filter(
            (sibling): sibling is HTMLElement =>
                sibling !== node && sibling instanceof HTMLElement && (sibling.matches('form') || sibling.querySelector('form') !== null),
        );
        if (view.length > 0) return view;
        node = node.parentElement;
    }

    return [];
}

/** Hide elements (and keep focus out of them) until the returned function shows them again. */
function hide(elements: HTMLElement[]): () => void {
    const display = elements.map((element) => element.style.display);
    for (const element of elements) {
        element.style.display = 'none';
        element.inert = true;
    }

    return () =>
        elements.forEach((element, i) => {
            element.style.display = display[i];
            element.inert = false;
        });
}

type Status = { kind: 'loading' } | { kind: 'none' } | { kind: 'ready' } | { kind: 'busy' };

/**
 * The security key step of the panel's checkpoint, for accounts that have a key. The key comes
 * first: its own screen stands in for the authenticator app's form and asks for the key at
 * once. Accounts that also use an authenticator app can switch to its form, where "Use a
 * security key" brings the key back.
 */
export default function CheckpointKey({ data }: { data: RouteSlotData }) {
    const token = confirmationToken();
    const [status, setStatus] = useState<Status>({ kind: 'loading' });
    const [onlyMethod, setOnlyMethod] = useState(false);
    const [method, setMethod] = useState<'key' | 'app'>('key');
    const [error, setError] = useState<string | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const started = useRef(false);

    const useKey = useCallback(async () => {
        setError(null);
        setMethod('key');
        setStatus({ kind: 'busy' });

        try {
            // A challenge is good for one attempt, so every attempt asks for a fresh one.
            const options = await checkpointOptions(token);
            if (!options) return setStatus({ kind: 'none' });
            setOnlyMethod(options.only_method);

            const credential = await navigator.credentials.get({ publicKey: requestOptions(options.public_key) });
            if (!(credential instanceof PublicKeyCredential)) throw new DOMException('No credential.', 'NotAllowedError');

            const result = await answerCheckpoint(token, credentialJson(credential));
            if (result.complete) {
                window.location.assign(redirectTarget(data.search, result.intended));

                return;
            }
        } catch (caught) {
            if (!isCancelled(caught)) setError(caught instanceof DOMException ? ceremonyError(caught) : httpErrorToHuman(caught));
        }

        setStatus({ kind: 'ready' });
    }, [token, data.search]);

    useEffect(() => {
        if (!token || !supportsWebAuthn()) return setStatus({ kind: 'none' });

        let cancelled = false;
        checkpointOptions(token)
            .then((options) => {
                if (cancelled) return;
                if (!options) return setStatus({ kind: 'none' });

                setOnlyMethod(options.only_method);
                setStatus({ kind: 'ready' });
                // The key comes first: ask for it straight away.
                if (!started.current) {
                    started.current = true;
                    void useKey();
                }
            })
            .catch(() => !cancelled && setStatus({ kind: 'none' }));

        return () => {
            cancelled = true;
        };
    }, [token, useKey]);

    const hasKey = status.kind === 'ready' || status.kind === 'busy';
    const keyFirst = hasKey && (method === 'key' || onlyMethod);

    // The key's screen stands in for the authenticator app's form, which comes back on request.
    useLayoutEffect(() => {
        if (!keyFirst || !root.current) return;

        const view = checkpointView(root.current);
        const show = hide(view);
        root.current.querySelector('button')?.focus();

        return () => {
            show();
            view[0]?.querySelector('input')?.focus();
        };
    }, [keyFirst]);

    if (!hasKey) return null;

    const alert = error && <Alert type='danger'>{error}</Alert>;
    const link = 'sk:cursor-pointer sk:border-0 sk:bg-transparent sk:p-0 sk:text-sm sk:text-muted-foreground sk:no-underline sk:hover:text-foreground';

    // Built from the UI kit (Empty, Button, Alert), so the active theme's skins draw it.
    return (
        <div ref={root} className='sk:mx-auto sk:w-full sk:max-w-md'>
            {keyFirst && (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <KeyRound aria-hidden />
                        </EmptyMedia>
                        <EmptyTitle role='heading' aria-level={1}>
                            Security key
                        </EmptyTitle>
                        <EmptyDescription>
                            {onlyMethod
                                ? 'This account is protected by a security key. Insert or tap your key to continue.'
                                : 'Insert or tap your security key to continue.'}
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button type='button' size='xlarge' onClick={() => void useKey()} isLoading={status.kind === 'busy'}>
                            <KeyRound aria-hidden />
                            Use a security key
                        </Button>
                        {alert}
                        {!onlyMethod && (
                            <button
                                type='button'
                                onClick={() => {
                                    setError(null);
                                    setMethod('app');
                                }}
                                className={link}
                            >
                                Use my authenticator app or a recovery code
                            </button>
                        )}
                        <PanelLink destination={{ to: '/auth/login', search: {} }} className={link}>
                            Back to login
                        </PanelLink>
                    </EmptyContent>
                </Empty>
            )}
            {!keyFirst && (
                <div className='sk:mt-6 sk:flex sk:flex-col sk:gap-3'>
                    <div className='sk:flex sk:items-center sk:gap-3 sk:text-xs sk:uppercase sk:text-muted-foreground'>
                        <span className='sk:h-px sk:flex-1 sk:bg-border' />
                        or
                        <span className='sk:h-px sk:flex-1 sk:bg-border' />
                    </div>
                    <Button type='button' isSecondary size='xlarge' onClick={() => void useKey()}>
                        <KeyRound aria-hidden />
                        Use a security key
                    </Button>
                </div>
            )}
        </div>
    );
}
