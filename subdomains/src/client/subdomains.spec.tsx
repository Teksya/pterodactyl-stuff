import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http } from '@pterodactyl/sdk/api';
import { createExtensionTestHost, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import * as api from './api';
import { addressOf, blockedReason, nameProblem, normalizeName, stateOf } from './present';
import SubdomainForm from './SubdomainForm';
import SubdomainTable from './SubdomainTable';
import type { Meta, Subdomain } from './types';

const meta: Meta = {
    configured: true,
    enabled: true,
    domains: ['example.com', 'play.example.net'],
    limit: 2,
    count: 0,
    min_length: 3,
    can_manage: true,
    service: '_minecraft._tcp',
    allocations: [
        { id: 1, ip: '203.0.113.5', alias: null, port: 25565, primary: true },
        { id: 2, ip: '203.0.113.5', alias: 'mc.example.org', port: 25566, primary: false },
    ],
};

const subdomain: Subdomain = {
    id: 4,
    name: 'play',
    domain: 'example.com',
    host: 'play.example.com',
    address: 'play.example.com',
    srv: true,
    port: 25565,
    allocation_id: null,
    follows_primary: true,
    records: [
        { type: 'A', name: 'play.example.com' },
        { type: 'SRV', name: '_minecraft._tcp.play.example.com' },
    ],
    status: 'active',
    error: null,
    synced_at: '2026-10-28T10:00:00+00:00',
    created_at: '2026-10-28T10:00:00+00:00',
    server: null,
};

const context = { kind: 'server', uuid: 'abc' } as const;

let host: ExtensionTestHost | null = null;

function withHost(children: ReactNode) {
    host = createExtensionTestHost();

    return render(children, { wrapper: host.Wrapper });
}

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

test('turns typed text into a DNS label and checks it as the server does', () => {
    expect(normalizeName('My Server_1')).toBe('my-server-1');
    expect(normalizeName('Café!')).toBe('caf');
    expect(nameProblem('', 3)).toBeNull();
    expect(nameProblem('ab', 3)).toBe('At least 3 characters.');
    expect(nameProblem('-play', 3)).toMatch(/hyphen/);
    expect(nameProblem('play-1', 3)).toBeNull();
});

test('shows the port only without SRV', () => {
    expect(addressOf('play.example.com', '_minecraft._tcp', 25566)).toBe('play.example.com');
    expect(addressOf('play.example.com', null, 28015)).toBe('play.example.com:28015');
    expect(stateOf({ status: 'error', error: 'Cloudflare: bad token' })).toEqual({ label: 'Error', tone: 'danger', hint: 'Cloudflare: bad token' });
});

test('says why a server cannot take another name', () => {
    expect(blockedReason(meta)).toBeNull();
    expect(blockedReason({ ...meta, count: 2 })).toMatch(/most subdomains/);
    expect(blockedReason({ ...meta, limit: null, count: 9 })).toBeNull();
    expect(blockedReason({ ...meta, configured: false })).toMatch(/setting up/);
    expect(blockedReason({ ...meta, enabled: false })).toMatch(/turned subdomains off/);
});

test('calls the URLs of each context', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { data: [] } });
    const patch = vi.spyOn(http, 'patch').mockResolvedValue({ data: { data: subdomain } });

    await api.listSubdomains(context);
    await api.listSubdomains({ kind: 'admin-server', serverId: 3 });
    await api.checkAvailable({ kind: 'admin-server', serverId: 3 }, 'play', 'example.com');
    await api.moveSubdomain({ kind: 'admin-server', serverId: 3 }, 4, null);

    expect(get.mock.calls.map(([url]) => url)).toEqual([
        '/api/client/servers/abc/extensions/subdomains/subdomains',
        '/api/admin/extensions/subdomains/servers/3/subdomains',
        '/api/admin/extensions/subdomains/available',
    ]);
    expect(patch).toHaveBeenCalledWith('/api/admin/extensions/subdomains/subdomains/4', { allocation_id: null });
});

test('checks the name while it is typed and creates the subdomain', async () => {
    const available = vi.spyOn(api, 'checkAvailable').mockResolvedValue({ available: true, reason: null });
    const create = vi.spyOn(api, 'createSubdomain').mockResolvedValue(subdomain);
    const onClose = vi.fn();
    withHost(<SubdomainForm context={context} meta={meta} open onClose={onClose} />);

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Play' } });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('play');
    screen.getByText('play.example.com');
    screen.getByText(/finds the port through an SRV record/);

    await screen.findByText('Available', {}, { timeout: 2000 });
    expect(available).toHaveBeenCalledWith(context, 'play', 'example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(context, { name: 'play', domain: 'example.com', allocation_id: null });
});

test('shows the reason a name is refused, and the server’s errors', async () => {
    vi.spyOn(api, 'checkAvailable').mockResolvedValue({ available: false, reason: 'This name is taken.' });
    vi.spyOn(api, 'createSubdomain').mockRejectedValue({
        response: { status: 422, data: { errors: [{ detail: 'The Cloudflare token cannot reach a zone for example.com.', meta: { source_field: 'dns' } }] } },
    });
    withHost(<SubdomainForm context={context} meta={{ ...meta, service: null }} open onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'ab' } });
    screen.getByText('At least 3 characters.');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'taken' } });
    screen.getByText('taken.example.com:25565');
    await screen.findByText('This name is taken.', {}, { timeout: 2000 });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    await screen.findByText(/cannot reach a zone/);
});

test('lists subdomains with their records and deletes one', async () => {
    const remove = vi.spyOn(api, 'deleteSubdomain').mockResolvedValue();
    withHost(<SubdomainTable subdomains={[subdomain]} contextOf={() => context} canManage allocations={meta.allocations} emptyDescription='None' />);

    await screen.findByText('play.example.com');
    screen.getByText('SRV');
    screen.getByText('203.0.113.5:25565 · primary');

    fireEvent.click(screen.getByRole('button', { name: 'Delete play.example.com' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(context, 4));
});
