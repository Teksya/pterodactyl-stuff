import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import type { ExtensionSetupContext } from '@pterodactyl/sdk';
import { http } from '@pterodactyl/sdk/api';
import { createExtensionTestHost, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import extension from './index';
import * as api from './api';
import EndpointEditor from './EndpointEditor';
import EventPicker from './EventPicker';
import { endpointState, eventsSummary, isAllEvents, patternMatches } from './present';
import type { Endpoint, Meta } from './types';
import { MASK } from './types';

const meta: Meta = {
    scope: 'server',
    providers: [
        {
            id: 'discord',
            label: 'Discord',
            description: 'Copy the webhook URL.',
            fields: [
                { key: 'url', label: 'Webhook URL', type: 'url', required: true, secret: true, help: '', placeholder: '', options: [], default: null },
                { key: 'username', label: 'Bot name', type: 'text', required: false, secret: false, help: '', placeholder: '', options: [], default: null },
            ],
        },
        {
            id: 'telegram',
            label: 'Telegram',
            description: '',
            fields: [
                { key: 'bot_token', label: 'Bot token', type: 'text', required: true, secret: true, help: '', placeholder: '', options: [], default: null },
                { key: 'silent', label: 'Send silently', type: 'toggle', required: false, secret: false, help: '', placeholder: '', options: [], default: false },
            ],
        },
    ],
    groups: [
        {
            id: 'server.power',
            label: 'Power',
            events: [
                { key: 'server:power.start', label: 'Server started', severity: 'success' },
                { key: 'server:power.stop', label: 'Server stopped', severity: 'warning' },
            ],
        },
        { id: 'server.status', label: 'Status and resources', events: [{ key: 'server:state.crashed', label: 'Server stopped unexpectedly', severity: 'danger' }] },
    ],
    limit: 10,
    count: 0,
    private_targets: false,
    monitor: true,
    monitor_interval: 1,
    enabled: true,
    can_manage: true,
    can_read_payloads: true,
};

const endpoint: Endpoint = {
    id: 7,
    uuid: '00000000-0000-0000-0000-000000000007',
    scope: 'server',
    server_id: 3,
    user_id: null,
    name: 'Alerts',
    provider: 'discord',
    config: { url: MASK, username: 'Panel' },
    target: 'Discord webhook 123',
    events: ['server:power.start'],
    filters: { servers: [], nodes: [] },
    enabled: true,
    failure_count: 0,
    disabled_reason: null,
    last_delivery_at: null,
    last_status: null,
    created_at: '2026-10-23T10:00:00+00:00',
    updated_at: '2026-10-23T10:00:00+00:00',
    server: null,
    user: null,
};

let host: ExtensionTestHost | null = null;

function withHost(children: ReactNode) {
    host = createExtensionTestHost();

    return render(children, { wrapper: host.Wrapper });
}

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.restoreAllMocks();
});

test('matches subscription patterns as the server does', () => {
    expect(patternMatches('server:power.start', 'server:power.start')).toBe(true);
    expect(patternMatches('server:backup.*', 'server:backup.complete')).toBe(true);
    expect(patternMatches('server:backup.*', 'server:power.start')).toBe(false);
    expect(patternMatches('*', 'admin:user.create')).toBe(true);
    expect(patternMatches('server:power.start', 'server:power.stop')).toBe(false);
});

test('summarises events and states', () => {
    expect(isAllEvents('account', ['user:*', 'auth:*'])).toBe(true);
    expect(isAllEvents('account', ['user:*'])).toBe(false);
    expect(eventsSummary('server', ['server:*'])).toBe('All events');
    expect(eventsSummary('server', ['server:power.start', 'server:power.stop'])).toBe('2 events');
    expect(endpointState({ ...endpoint, enabled: false, disabled_reason: 'Turned off after 20 failed deliveries in a row.' })).toMatchObject({ label: 'Turned off', tone: 'danger' });
    expect(endpointState({ ...endpoint, last_status: 'failed', failure_count: 3 })).toMatchObject({ label: 'Failing', hint: '3 failed in a row' });
    expect(endpointState(endpoint).label).toBe('Active');
});

test('calls the URLs of each context', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { data: [] } });
    const patch = vi.spyOn(http, 'patch').mockResolvedValue({ data: { data: endpoint } });

    await api.listEndpoints({ kind: 'server', uuid: 'abc' });
    await api.listEndpoints({ kind: 'account' });
    await api.listEndpoints({ kind: 'admin-server', serverId: 3 });
    await api.updateEndpoint({ kind: 'admin-user', userId: 9 }, 7, { name: 'x', provider: 'http', config: {}, events: ['*'], enabled: true });

    expect(get.mock.calls.map(([url]) => url)).toEqual([
        '/api/client/servers/abc/extensions/webhooks/webhooks',
        '/api/client/extensions/webhooks/webhooks',
        '/api/admin/extensions/webhooks/servers/3/webhooks',
    ]);
    expect(patch.mock.calls[0][0]).toBe('/api/admin/extensions/webhooks/webhooks/7');
    expect(api.adminContextOf({ scope: 'account', server_id: null, user_id: 9 })).toEqual({ kind: 'admin-user', userId: 9 });
});

test('reads the field errors of a 422 answer', () => {
    const error = {
        response: {
            status: 422,
            data: { errors: [{ detail: 'The name field is required.', meta: { source_field: 'name' } }, { detail: 'Second', meta: { source_field: 'name' } }] },
        },
    };

    expect(api.validationErrors(error)).toEqual({ name: 'The name field is required.' });
    expect(api.validationErrors(new Error('nope'))).toEqual({});
});

function Picker({ initial = [] as string[] }) {
    const [value, setValue] = useState(initial);

    return (
        <>
            <EventPicker scope='server' meta={meta} value={value} onChange={setValue} />
            <output data-testid='value'>{JSON.stringify(value)}</output>
        </>
    );
}

test('picks single events, whole groups, everything and patterns', async () => {
    withHost(<Picker />);
    const value = () => JSON.parse(screen.getByTestId('value').textContent ?? '[]') as string[];

    fireEvent.click(await screen.findByRole('checkbox', { name: /all power events/i }));
    expect(value()).toEqual(['server:power.start', 'server:power.stop']);

    fireEvent.change(screen.getByLabelText('Other events'), { target: { value: 'server:backup.*, server:file.write' } });
    expect(value()).toEqual(['server:power.start', 'server:power.stop', 'server:backup.*', 'server:file.write']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search events' }), { target: { value: 'crash' } });
    expect(screen.queryByText('Server started')).toBeNull();
    screen.getByText('Server stopped unexpectedly');

    fireEvent.click(screen.getByRole('switch', { name: /every event/i }));
    expect(value()).toEqual(['server:*']);
    // Every event includes state events: the monitor notice says how they are found.
    screen.getByText(/check of the server every minute/i);
});

test('creates a webhook with the provider settings and events', async () => {
    vi.spyOn(api, 'getMeta').mockResolvedValue(meta);
    const create = vi.spyOn(api, 'createEndpoint').mockResolvedValue(endpoint);
    const onClose = vi.fn();
    withHost(<EndpointEditor context={{ kind: 'server', uuid: 'abc' }} onClose={onClose} />);

    fireEvent.change(await screen.findByLabelText(/^name/i), { target: { value: 'Alerts' } });
    fireEvent.change(screen.getByLabelText(/webhook url/i), { target: { value: 'https://discord.com/api/webhooks/1/abc' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /all power events/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create webhook' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
        { kind: 'server', uuid: 'abc' },
        {
            name: 'Alerts',
            provider: 'discord',
            config: { url: 'https://discord.com/api/webhooks/1/abc', username: '' },
            events: ['server:power.start', 'server:power.stop'],
            enabled: true,
        }
    );
});

test('keeps a saved secret masked, and shows the server’s field errors', async () => {
    vi.spyOn(api, 'getMeta').mockResolvedValue(meta);
    const update = vi.spyOn(api, 'updateEndpoint').mockRejectedValue({
        response: { status: 422, data: { errors: [{ detail: 'The bot name is too long.', meta: { source_field: 'config.username' } }] } },
    });
    withHost(<EndpointEditor context={{ kind: 'server', uuid: 'abc' }} endpoint={endpoint} onClose={vi.fn()} />);

    const url = (await screen.findByLabelText(/webhook url/i)) as HTMLInputElement;
    expect(url.value).toBe('');
    screen.getByText('Saved. Type a new value to replace it.');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('The bot name is too long.', { selector: 'p' });
    expect(update.mock.calls[0][2].config).toEqual({ url: MASK, username: 'Panel' });
});

test('switching service resets the settings to the new one’s fields', async () => {
    vi.spyOn(api, 'getMeta').mockResolvedValue(meta);
    const update = vi.spyOn(api, 'updateEndpoint').mockResolvedValue(endpoint);
    withHost(<EndpointEditor context={{ kind: 'server', uuid: 'abc' }} endpoint={endpoint} onClose={vi.fn()} />);

    await screen.findByLabelText(/webhook url/i);
    // The Select is the SDK's own: choose through its listbox.
    const service = screen.getByLabelText('Service');
    fireEvent.pointerDown(service, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseDown(service, { button: 0 });
    fireEvent.click(service);
    if (!screen.queryByRole('option', { name: 'Telegram' })) fireEvent.keyDown(service, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Telegram' }));
    fireEvent.change(screen.getByLabelText(/bot token/i), { target: { value: '123456:abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][2]).toMatchObject({ provider: 'telegram', config: { bot_token: '123456:abc', silent: false } });
});

test('registers every screen, and hides server and account screens when turned off', () => {
    const register = vi.fn();
    extension.setup({ meta: { id: 'webhooks' }, config: {}, screens: { register }, slots: { register: vi.fn() } } as unknown as ExtensionSetupContext);

    expect(register.mock.calls.map(([id]) => id)).toEqual(['admin-webhooks', 'admin-server-webhooks', 'admin-user-webhooks', 'server-webhooks', 'account-webhooks']);

    const visible = (id: string, config: Record<string, unknown>) =>
        (register.mock.calls.find(([screen]) => screen === id)?.[2] as { visible: (context: { config: Record<string, unknown> }) => boolean }).visible({ config });
    expect(visible('server-webhooks', {})).toBe(true);
    expect(visible('server-webhooks', { server_webhooks: false })).toBe(false);
    expect(visible('account-webhooks', { account_webhooks: false })).toBe(false);
});
