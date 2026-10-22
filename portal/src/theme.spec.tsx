import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { preloadTheme, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type {
    CheckpointFormModel,
    FieldAttributes,
    FieldModel,
    ForgotPasswordFormModel,
    LoginFormModel,
    ResetPasswordFormModel,
    ViewName,
} from '@pterodactyl/sdk';
import manifest from '../extension.json';
import theme from './theme';

const themes = [theme];

// The pages are lazy; loading their chunk first lets renderView render them synchronously.
beforeAll(() => preloadTheme(themes));

let rendered: RenderedView | undefined;

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
});

function show<N extends ViewName>(name: N, options: Omit<Parameters<typeof renderView<N>>[1] & object, 'themes'> = {}) {
    rendered = renderView(name, { themes, ...options });

    return rendered.container;
}

function field(name: string, attributes: FieldAttributes, value = '', error: string | null = null): FieldModel {
    return { fieldProps: { name, value, onChange: vi.fn(), onBlur: vi.fn(), ...attributes }, error };
}

function loginModel(overrides: Partial<LoginFormModel> = {}): LoginFormModel {
    return {
        fields: {
            username: field('username', { type: 'text', autoComplete: 'username' }),
            password: field('password', { type: 'password', autoComplete: 'current-password' }),
        },
        submit: vi.fn(),
        canSubmit: true,
        submitting: false,
        Captcha: null,
        forgotPassword: { to: '/auth/password' },
        route: { pathname: '/auth/login', search: {}, params: {} },
        ...overrides,
    };
}

test('is a theme over classic, in both schemes, that draws the layouts, the search and the auth pages', () => {
    expect(manifest.type).toBe('theme');
    expect(manifest.theme.extends).toBe('classic');
    expect(manifest.theme.schemes).toEqual(['dark', 'light']);
    expect(Object.keys(theme.views ?? {})).toEqual([
        'layout.auth',
        'page.auth.login',
        'page.auth.checkpoint',
        'page.auth.password',
        'page.auth.passwordReset',
        'layout.app',
        'layout.account',
        'layout.server',
        'layout.admin',
        'app.search',
        'server.files.manager.list',
        'activity.log',
    ]);
});

test('frames the sign-in pages with the brand and a main landmark', () => {
    const container = show('layout.auth');

    // The name shows twice: on the brand half for wide screens, above the form for narrow ones.
    expect(screen.getAllByText('Pterodactyl')).toHaveLength(2);
    expect(container.querySelector('main')).toBeTruthy();
    expect(container.textContent).toContain('Pterodactyl Software');
    // The tagline setting's default, while the settings hold no value.
    expect(container.textContent).toContain('Your servers, one sign-in away.');
});

test("shows the theme's logo in place of the panel's name", () => {
    show('layout.auth', { fixture: 'logo' });

    expect(screen.getAllByRole('img', { name: 'Pterodactyl' })[0].getAttribute('src')).toBe(
        '/favicons/android-chrome-192x192.png'
    );
    expect(screen.queryByText('Pterodactyl')).toBeNull();
});

test('keeps the login fields the engine hands over and submits through the model', () => {
    const model = loginModel();
    const container = show('page.auth.login', { model });

    const username = screen.getByLabelText('Username or email');
    expect(username.getAttribute('name')).toBe('username');
    expect(username.getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/auth/password');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(model.submit).toHaveBeenCalledOnce();
    expect(container.querySelector('form button[type="submit"]')).toBeTruthy();
});

test('keeps the auth.login.form.after slot inside the login form, with the route', () => {
    const container = show('page.auth.login', {
        slots: { 'auth.login.form.after': ({ data }) => <p data-testid='slotted'>Captcha for {data.pathname}</p> },
    });

    expect(screen.getByTestId('slotted').textContent).toBe('Captcha for /auth/login');
    expect(container.querySelector('form [data-testid="slotted"]')).toBeTruthy();
});

test('renders the captcha inside each form that carries one', () => {
    const Captcha = () => <div data-testid='captcha' />;
    const forms = [
        () => show('page.auth.login', { model: loginModel({ Captcha }) }),
        () => show('page.auth.password', { model: { ...forgotModel(), Captcha } }),
        () => show('page.auth.passwordReset', { model: { ...resetModel(), Captcha } }),
    ];

    for (const render of forms) {
        expect(render().querySelector('form [data-testid="captcha"]')).toBeTruthy();
    }
});

test('shows field errors and the busy state of the fixtures', () => {
    show('page.auth.login', { fixture: 'invalid' });
    expect(screen.getByText('A username or email must be provided.')).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toBe(
        screen.getByText('Please enter your account password.').id
    );

    show('page.auth.login', { fixture: 'submitting' });
    expect(screen.getByLabelText('Username or email').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /Sign in/ }).getAttribute('aria-busy')).toBe('true');
});

test('shows and hides the password on request', () => {
    show('page.auth.login');

    const password = screen.getByLabelText('Password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.getAttribute('type')).toBe('password');
});

function checkpointModel(recovery: boolean): CheckpointFormModel {
    return {
        fields: { code: field(recovery ? 'recoveryCode' : 'code', { type: 'text', autoComplete: 'one-time-code' }) },
        submit: vi.fn(),
        canSubmit: true,
        submitting: false,
        recovery,
        toggleRecovery: vi.fn(),
        login: { to: '/auth/login', search: {} },
    };
}

test('asks for the authenticator code, then a recovery code on request', () => {
    const model = checkpointModel(false);
    show('page.auth.checkpoint', { model });

    expect(screen.getByRole('heading', { name: 'Two-factor authentication' })).toBeTruthy();
    expect(screen.getByLabelText('Authentication code').getAttribute('autocomplete')).toBe('one-time-code');
    fireEvent.click(screen.getByRole('button', { name: 'Lost your device? Use a recovery code' }));
    expect(model.toggleRecovery).toHaveBeenCalledOnce();

    show('page.auth.checkpoint', { fixture: 'recovery' });
    expect(screen.getByLabelText('Recovery code').getAttribute('name')).toBe('recoveryCode');
    expect(screen.getByRole('button', { name: 'Use my authenticator app' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to login/ }).getAttribute('href')).toBe('/auth/login');
});

function forgotModel(): ForgotPasswordFormModel {
    return {
        fields: { email: field('email', { type: 'email', autoComplete: 'email' }) },
        submit: vi.fn(),
        canSubmit: true,
        submitting: false,
        Captcha: null,
        login: { to: '/auth/login' },
    };
}

test('requests a reset link for an email', () => {
    const model = forgotModel();
    show('page.auth.password', { model });

    expect(screen.getByLabelText('Email').getAttribute('type')).toBe('email');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(model.submit).toHaveBeenCalledOnce();

    show('page.auth.password', { fixture: 'invalid' });
    expect(screen.getByText('A valid email address must be provided to continue.')).toBeTruthy();
});

function resetModel(): ResetPasswordFormModel {
    return {
        fields: {
            password: field('password', { type: 'password', autoComplete: 'new-password' }),
            passwordConfirmation: field('passwordConfirmation', { type: 'password', autoComplete: 'new-password' }),
        },
        submit: vi.fn(),
        canSubmit: true,
        submitting: false,
        Captcha: null,
        email: 'admin@example.com',
        login: { to: '/auth/login' },
    };
}

test('resets the password of the account from the emailed link', () => {
    const model = resetModel();
    show('page.auth.passwordReset', { model });

    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('admin@example.com');
    expect(email.readOnly).toBe(true);
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('New password').getAttribute('autocomplete')).toBe('new-password');

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(model.submit).toHaveBeenCalledOnce();

    const mismatch = show('page.auth.passwordReset', { fixture: 'mismatch' });
    expect(mismatch.querySelector('[aria-invalid="true"]')).toBeTruthy();
});

test('renders every auth view from its fixtures without dropping a slot', () => {
    const fixtures: [ViewName, string[]][] = [
        ['layout.auth', ['default', 'logo']],
        ['page.auth.login', ['default', 'invalid', 'submitting']],
        ['page.auth.checkpoint', ['code', 'recovery']],
        ['page.auth.password', ['default', 'invalid']],
        ['page.auth.passwordReset', ['default', 'mismatch']],
    ];

    for (const [view, names] of fixtures) {
        for (const fixture of names) expect(() => show(view, { fixture, strict: true }), `${view} ${fixture}`).not.toThrow();
    }
});
