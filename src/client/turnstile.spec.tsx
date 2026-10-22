import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import type { ExtensionSetupContext } from '@pterodactyl/sdk';
import { http } from '@pterodactyl/sdk/api';
import extension from './index';
import TurnstileWidget from './TurnstileWidget';
import { TOKEN_FIELD, isProtectedRequest, setToken, takeToken, trackWidget, withToken } from './token';

const turnstile = { render: vi.fn(() => 'widget-1'), reset: vi.fn(), remove: vi.fn() };

beforeEach(() => {
    window.turnstile = turnstile;
});

afterEach(() => {
    cleanup();
    setToken(null);
    vi.useRealTimers();
    vi.clearAllMocks();
    delete window.turnstile;
});

test('only guards the posts the panel protects with a captcha', () => {
    expect(isProtectedRequest('post', '/auth/login')).toBe(true);
    expect(isProtectedRequest('POST', '/auth/password')).toBe(true);
    expect(isProtectedRequest('post', '/auth/password/reset')).toBe(true);
    expect(isProtectedRequest('post', '/auth/login/checkpoint')).toBe(false);
    expect(isProtectedRequest('get', '/auth/login')).toBe(false);
    expect(isProtectedRequest('post', '/api/client/account')).toBe(false);
});

test('adds the token to objects, JSON strings and form data', () => {
    expect(withToken({ user: 'a' }, 't')).toEqual({ user: 'a', [TOKEN_FIELD]: 't' });
    expect(JSON.parse(withToken('{"user":"a"}', 't') as string)).toEqual({ user: 'a', [TOKEN_FIELD]: 't' });
    expect(withToken(undefined, 't')).toEqual({ [TOKEN_FIELD]: 't' });

    const form = withToken(new FormData(), 't') as FormData;
    expect(form.get(TOKEN_FIELD)).toBe('t');
});

test('renders the widget and hands its token to the next submit once', async () => {
    render(<TurnstileWidget siteKey='site' theme='dark' />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());

    const options = (turnstile.render.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(options).toMatchObject({ sitekey: 'site', theme: 'dark' });

    (options.callback as (token: string) => void)('solved');

    await expect(takeToken()).resolves.toBe('solved');
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
});

test('waits for the challenge while a widget is on show, up to the timeout', async () => {
    vi.useFakeTimers();
    const untrack = trackWidget();

    const pending = takeToken(1000);
    setToken('late');
    await expect(pending).resolves.toBe('late');

    const expired = takeToken(1000);
    vi.advanceTimersByTime(1000);
    await expect(expired).resolves.toBeNull();

    untrack();
});

test('does not wait when no widget is on show', async () => {
    await expect(takeToken(60_000)).resolves.toBeNull();
});

test('registers the widget on the auth pages and adds its token to their submits', async () => {
    const register = vi.fn();
    const context = { meta: { id: 'turnstile' }, config: { site_key: 'site', theme: 'dark' }, slots: { register } };
    extension.setup(context as unknown as ExtensionSetupContext);

    expect(register.mock.calls.map(([slot]) => slot)).toEqual([
        'auth.login.form.after',
        'auth.password.after',
        'auth.passwordReset.after',
    ]);

    const untrack = trackWidget();
    setToken('solved');

    // The panel's own axios instance, with a stand-in adapter that records the body it would send.
    const sent: unknown[] = [];
    const record: AxiosAdapter = async (config) => {
        sent.push(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);

        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await http.post('/auth/login', { user: 'a' }, { adapter: record });
    await http.post('/api/client/account', { user: 'a' }, { adapter: record });

    expect(sent).toEqual([{ user: 'a', [TOKEN_FIELD]: 'solved' }, { user: 'a' }]);

    untrack();
});

test('stays out of the way without a site key', () => {
    const register = vi.fn();
    extension.setup({ meta: { id: 'turnstile' }, config: {}, slots: { register } } as unknown as ExtensionSetupContext);

    expect(register).not.toHaveBeenCalled();
});

test('removes the widget when the page leaves', async () => {
    const { unmount } = render(<TurnstileWidget siteKey='site' theme='auto' />);
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());

    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
});
