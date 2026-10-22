/** The routes the panel guards with its `recaptcha` middleware: login, forgot password and password reset. */
const PROTECTED_PATH = /^\/auth\/(login|password|password\/reset)\/?$/;

/** The body field the extension's VerifyTurnstile middleware reads. */
export const TOKEN_FIELD = 'cf-turnstile-response';

/** How long a submit waits for the widget to finish its challenge before sending without a token. */
export const TOKEN_TIMEOUT_MS = 30_000;

type Waiter = (token: string | null) => void;

let current: string | null = null;
let waiters: Waiter[] = [];
let reset: (() => void) | null = null;
let mounted = 0;

/** Counts the widgets on show; a submit only waits for a token while one is. */
export function trackWidget(): () => void {
    mounted++;

    return () => {
        mounted--;
    };
}

/** Records the token the widget produced, or clears it when it expires or fails. */
export function setToken(token: string | null): void {
    current = token || null;

    if (current !== null) {
        const pending = waiters;
        waiters = [];
        pending.forEach((resolve) => resolve(current));
    }
}

/** The widget on show registers how to restart its challenge; null when it unmounts. */
export function setReset(fn: (() => void) | null): void {
    reset = fn;
}

/**
 * Takes the current token, waiting up to `timeoutMs` for one, and restarts the widget: a token
 * is valid for one verification, so the next attempt (after a wrong password, say) needs another.
 */
export function takeToken(timeoutMs = TOKEN_TIMEOUT_MS): Promise<string | null> {
    const consume = (token: string | null) => {
        current = null;
        reset?.();

        return token;
    };

    if (current !== null) {
        return Promise.resolve(consume(current));
    }

    if (mounted === 0) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const waiter: Waiter = (token) => {
            window.clearTimeout(timeout);
            resolve(consume(token));
        };
        const timeout = window.setTimeout(() => {
            waiters = waiters.filter((other) => other !== waiter);
            resolve(null);
        }, timeoutMs);

        waiters.push(waiter);
    });
}

/** Whether a request goes to a route the panel protects with a captcha. */
export function isProtectedRequest(method: string | undefined, url: string | undefined): boolean {
    if (method?.toLowerCase() !== 'post' || !url) {
        return false;
    }

    return PROTECTED_PATH.test(new URL(url, window.location.origin).pathname);
}

/** Adds the token to a request body, whether the client already serialized it to JSON or not. */
export function withToken(data: unknown, token: string): unknown {
    if (data instanceof FormData || data instanceof URLSearchParams) {
        data.set(TOKEN_FIELD, token);

        return data;
    }

    if (typeof data === 'string') {
        try {
            const parsed: unknown = JSON.parse(data);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return JSON.stringify({ ...parsed, [TOKEN_FIELD]: token });
            }
        } catch {
            // Not JSON: leave the body as it is.
        }

        return data;
    }

    if (data === undefined || data === null) {
        return { [TOKEN_FIELD]: token };
    }

    return typeof data === 'object' && !Array.isArray(data) ? { ...data, [TOKEN_FIELD]: token } : data;
}
