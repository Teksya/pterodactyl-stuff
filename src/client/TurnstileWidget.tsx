import { useEffect, useRef } from 'react';
import { setReset, setToken, trackWidget } from './token';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export type TurnstileTheme = 'auto' | 'light' | 'dark';

interface TurnstileApi {
    render: (container: HTMLElement, options: Record<string, unknown>) => string | undefined;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once, for every page that shows the widget. */
function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) {
        return Promise.resolve(window.turnstile);
    }

    loading ??= new Promise<TurnstileApi>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.')));
        script.onerror = () => {
            loading = null;
            script.remove();
            reject(new Error('Unable to load Turnstile.'));
        };
        document.head.appendChild(script);
    });

    return loading;
}

/** The Turnstile challenge of an auth page; its token goes out with the page's submit. */
export default function TurnstileWidget({ siteKey, theme }: { siteKey: string; theme: TurnstileTheme }) {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let widgetId: string | undefined;
        let cancelled = false;
        const untrack = trackWidget();

        setToken(null);
        loadTurnstile()
            .then((turnstile) => {
                if (cancelled || !container.current) return;

                widgetId = turnstile.render(container.current, {
                    sitekey: siteKey,
                    theme,
                    size: 'flexible',
                    callback: (token: string) => setToken(token),
                    'expired-callback': () => setToken(null),
                    'error-callback': () => setToken(null),
                });

                const id = widgetId;
                if (id !== undefined) setReset(() => turnstile.reset(id));
            })
            .catch((error: unknown) => console.error('[turnstile]', error));

        return () => {
            cancelled = true;
            untrack();
            setReset(null);
            setToken(null);
            if (widgetId !== undefined) window.turnstile?.remove(widgetId);
        };
    }, [siteKey, theme]);

    return <div ref={container} className='ts:mt-4 ts:flex ts:min-h-16 ts:w-full ts:justify-center' />;
}
