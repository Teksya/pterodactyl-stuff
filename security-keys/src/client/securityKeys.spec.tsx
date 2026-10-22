import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ExtensionSetupContext } from '@pterodactyl/sdk';
import { createExtensionTestHost, renderView, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import extension from './index';
import CheckpointKey from './CheckpointKey';
import PasswordlessButton from './PasswordlessButton';
import KeysScreen from './KeysScreen';
import * as api from './api';
import { credentialJson, fromBase64Url, redirectTarget, requestOptions, toBase64Url } from './webauthn';

vi.mock('./api', async (original) => ({
    ...(await original<typeof import('./api')>()),
    checkpointOptions: vi.fn(),
    answerCheckpoint: vi.fn(),
    loginOptions: vi.fn(),
    passwordlessLogin: vi.fn(),
    listKeys: vi.fn(),
}));

const route = { pathname: '/auth/login/checkpoint', search: { redirect: '/server/abc' }, params: {} };
const bytes = (...values: number[]) => new Uint8Array(values).buffer;

class FakeCredential {
    id = 'AQI';
    rawId = bytes(1, 2);
    type = 'public-key';
    response = { clientDataJSON: bytes(3), authenticatorData: bytes(4), signature: bytes(5), userHandle: bytes(6) };
}

let host: ExtensionTestHost | null = null;
const get = vi.fn();
const assign = vi.fn();

function withHost(children: ReactNode) {
    host = createExtensionTestHost();

    return render(children, { wrapper: host.Wrapper });
}

beforeEach(() => {
    vi.stubGlobal('PublicKeyCredential', FakeCredential);
    Object.defineProperty(navigator, 'credentials', { value: { get, create: vi.fn() }, configurable: true });
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, configurable: true });
    window.history.replaceState({ token: 'checkpoint-token' }, '');
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

test('encodes binary values as unpadded base64url, both ways', () => {
    expect(toBase64Url(bytes(251, 255, 191))).toBe('-_-_');
    expect(new Uint8Array(fromBase64Url('-_-_'))).toEqual(new Uint8Array([251, 255, 191]));

    const options = requestOptions({ challenge: 'AQI', allowCredentials: [{ id: 'AwQ', type: 'public-key' }] });
    expect(new Uint8Array(options.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(options.allowCredentials![0].id as ArrayBuffer)).toEqual(new Uint8Array([3, 4]));
});

test('sends an assertion with every field the server checks', () => {
    expect(credentialJson(new FakeCredential() as unknown as PublicKeyCredential)).toEqual({
        id: 'AQI',
        rawId: 'AQI',
        type: 'public-key',
        response: { clientDataJSON: 'Aw', authenticatorData: 'BA', signature: 'BQ', userHandle: 'Bg' },
    });
});

test('only follows redirects that stay on the panel', () => {
    expect(redirectTarget({ redirect: '/server/abc' }, '/')).toBe('/server/abc');
    expect(redirectTarget({ redirect: '//evil.example' }, '/')).toBe('/');
    expect(redirectTarget({ redirect: 'https://evil.example' }, '/home')).toBe('/home');
    expect(redirectTarget({}, undefined)).toBe('/');
});

test('registers the checkpoint slot, the screens, and the login button only when passwordless is on', () => {
    const register = vi.fn();
    const screens = { register: vi.fn() };
    const context = (config: Record<string, unknown>) =>
        ({ meta: { id: 'security-keys' }, config, slots: { register }, screens }) as unknown as ExtensionSetupContext;

    extension.setup(context({}));
    expect(register.mock.calls.map(([slot]) => slot)).toEqual(['auth.checkpoint.after']);
    expect(screens.register.mock.calls.map(([id]) => id)).toEqual(['keys', 'user-keys']);

    register.mockClear();
    extension.setup(context({ passwordless: true }));
    expect(register.mock.calls.map(([slot]) => slot)).toEqual(['auth.checkpoint.after', 'auth.login.form.after']);
});

test('stays hidden at the checkpoint of an account without keys', async () => {
    vi.mocked(api.checkpointOptions).mockResolvedValue(null);
    const { container } = withHost(<CheckpointKey data={route} />);

    await waitFor(() => expect(api.checkpointOptions).toHaveBeenCalledWith('checkpoint-token'));
    expect(container.innerHTML).toBe('');
});

test('answers the checkpoint with a key and follows the redirect', async () => {
    vi.mocked(api.checkpointOptions).mockResolvedValue({ public_key: { challenge: 'AQI' }, only_method: false });
    vi.mocked(api.answerCheckpoint).mockResolvedValue({ complete: true, intended: '/' });
    get.mockResolvedValue(new FakeCredential());
    withHost(<CheckpointKey data={route} />);

    // Beside an authenticator app the key waits to be chosen.
    fireEvent.click(await screen.findByRole('button', { name: /use a security key/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/server/abc'));
    expect(api.answerCheckpoint).toHaveBeenCalledWith('checkpoint-token', expect.objectContaining({ rawId: 'AQI' }));
});

test('asks for the key at once when it is the account’s only second factor, and shows a refusal', async () => {
    vi.mocked(api.checkpointOptions).mockResolvedValue({ public_key: { challenge: 'AQI' }, only_method: true });
    vi.mocked(api.answerCheckpoint).mockRejectedValue(new Error('The security key response is not valid.'));
    get.mockResolvedValue(new FakeCredential());
    withHost(<CheckpointKey data={route} />);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole('alert')).textContent).toBe('The security key response is not valid.');
    screen.getByText(/protected by a security key/i);
    expect(assign).not.toHaveBeenCalled();
});

test('puts the passwordless button inside the login form', () => {
    renderView('page.auth.login', { slots: { 'auth.login.form.after': PasswordlessButton }, prefix: 'sk' });

    const button = screen.getByRole('button', { name: /sign in with a security key/i });
    expect(button.closest('form')).not.toBeNull();
});

test('signs in without a password', async () => {
    vi.mocked(api.loginOptions).mockResolvedValue({ challenge: 'AQI' });
    vi.mocked(api.passwordlessLogin).mockResolvedValue({ complete: true, intended: '/' });
    get.mockResolvedValue(new FakeCredential());
    withHost(<PasswordlessButton data={{ ...route, search: {} }} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in with a security key/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(api.passwordlessLogin).toHaveBeenCalledWith(expect.objectContaining({ response: expect.objectContaining({ userHandle: 'Bg' }) }));
});

test('shows an empty state on the account screen until a key is added', async () => {
    vi.mocked(api.listKeys).mockResolvedValue([]);
    withHost(<KeysScreen />);

    await screen.findByText('No security keys');
    expect((screen.getByRole('button', { name: /add key/i }) as HTMLButtonElement).disabled).toBe(true);
});
