import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { http } from '@pterodactyl/sdk/api';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import manifest from '../../extension.json';
import DeployScreen from './DeployScreen';
import { canRollback, duration, guessProvider, isSshUrl, parsePaths, statusOf } from './present';
import { MASK, type Deployment, type Meta, type Repository } from './types';

let host: ExtensionTestHost | null = null;

function withHost(children: ReactNode, permissions = ['*']) {
    host = createExtensionTestHost({ prefix: 'gd', server: createTestServer({ uuid: 'abc', identifier: 'abc1', permissions }) });

    return render(children, { wrapper: host.Wrapper });
}

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.restoreAllMocks();
});

const deployment = (id: number, overrides: Partial<Deployment> = {}): Deployment => ({
    id,
    uuid: `00000000-0000-0000-0000-00000000000${id}`,
    branch: 'main',
    commit: `${id}abcdef1234567890abcdef1234567890abcd`,
    message: `Commit ${id}`,
    author: 'Ada',
    trigger: 'push',
    status: 'success',
    release: `20261103120${id}00-${id}abcdef`,
    current: false,
    user: null,
    created_at: '2026-11-03T12:00:00Z',
    started_at: '2026-11-03T12:00:00Z',
    finished_at: '2026-11-03T12:00:42Z',
    log: null,
    ...overrides,
});

const repository: Repository = {
    uuid: '11111111-2222-3333-4444-555555555555',
    provider: 'github',
    url: 'https://github.com/acme/site',
    branch: 'main',
    directory: '/',
    shared_paths: ['.env', 'storage/'],
    after_deploy: 'restart',
    command: null,
    auto_deploy: true,
    current_release: '20261103120200-2abcdef',
    token: MASK,
    ssh_public_key: null,
    webhook_url: 'https://panel.test/extensions/git-deploy/hooks/11111111-2222-3333-4444-555555555555',
    webhook_secret: 's3cret',
    last_deployment: deployment(2, { current: true }),
};

const meta = (overrides: Partial<Meta> = {}): Meta => ({
    providers: [
        { id: 'github', label: 'GitHub' },
        { id: 'gitlab', label: 'GitLab' },
        { id: 'gitea', label: 'Gitea / Forgejo' },
        { id: 'generic', label: 'Any Git server' },
    ],
    git_available: true,
    keep_releases: 5,
    can_deploy: true,
    can_manage: true,
    repository,
    egg: null,
    ...overrides,
});

/** Answers the extension's calls by URL. */
function mockApi(data: Meta) {
    const get = vi.spyOn(http, 'get').mockImplementation(async (url: string) => {
        if (url.endsWith('/meta')) return { data: { data } };
        if (url.endsWith('/deployments')) return { data: { data: [deployment(2, { current: true }), deployment(1)], meta: { page: 1, pages: 1, total: 2 } } };
        if (url.endsWith('/commits')) {
            return { data: { data: [{ sha: 'aaaaaaa111', title: 'Fix the footer', author: 'Ada', date: null, url: null }, { sha: 'bbbbbbb222', title: 'Add a page', author: 'Bob', date: null, url: null }] } };
        }
        throw new Error(`Unexpected GET ${url}`);
    });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { data: deployment(3, { status: 'queued', commit: 'bbbbbbb222' }) } });
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: { data: repository } });

    return { get, post, put };
}

test('declares the Deploy tab and the admin page', () => {
    expect(manifest.ui.screens.map((item) => item.id)).toEqual(['admin-deploys', 'server-deploy']);
    expect(manifest.ui.screens[1]).toMatchObject({ area: 'server', permission: ['ext.git-deploy.read'] });
});

test('guesses the forge and reads paths', () => {
    expect(guessProvider('https://github.com/acme/site')).toBe('github');
    expect(guessProvider('https://gitlab.acme.lan/web/site.git')).toBe('gitlab');
    expect(guessProvider('https://codeberg.org/acme/site')).toBe('gitea');
    expect(guessProvider('https://git.acme.lan/acme/site')).toBe('generic');
    expect(guessProvider('git@github.com:acme/site.git')).toBe('generic');
    expect(isSshUrl('ssh://git@host:2222/acme/site.git')).toBe(true);
    expect(isSshUrl('https://host/acme/site')).toBe(false);
    expect(parsePaths('.env\n storage/ ,uploads/\n\n.env')).toEqual(['.env', 'storage/', 'uploads/']);
    expect(duration('2026-11-03T12:00:00Z', '2026-11-03T12:02:05Z')).toBe('2 min 5 s');
    expect(statusOf('failed')).toEqual({ label: 'Failed', tone: 'danger' });
    expect(canRollback(deployment(1))).toBe(true);
    expect(canRollback(deployment(2, { current: true }))).toBe(false);
    expect(canRollback(deployment(4, { status: 'failed' }))).toBe(false);
});

test('shows the repository, the webhook and the deploys, and deploys a chosen commit', async () => {
    const api = mockApi(meta());
    withHost(<DeployScreen data={{ pathname: '/', params: {}, search: {} }} />);

    await screen.findByText('https://github.com/acme/site');
    screen.getByText(repository.webhook_url);
    screen.getByText('s3cret');
    screen.getByText(/Settings → Webhooks → Add webhook/);
    await screen.findByText('Commit 1');
    screen.getByText('Live');

    fireEvent.click(screen.getByRole('button', { name: 'Deploy now' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Add a page/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deploy' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/git-deploy/deploy', { commit: 'bbbbbbb222', message: 'Add a page' }));
});

test('rolls back to an earlier deploy, never to the live one', async () => {
    const api = mockApi(meta());
    withHost(<DeployScreen data={{ pathname: '/', params: {}, search: {} }} />);

    await screen.findByText('Commit 1');
    expect(screen.queryByRole('button', { name: /Roll back to 2abcdef/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Roll back to 1abcdef/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Roll back' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/git-deploy/deployments/1/rollback'));
});

test('links a repository from a community egg’s variables', async () => {
    const api = mockApi(meta({ repository: null, egg: { url: 'https://gitlab.com/acme/api', branch: 'production', has_token: true, auto_update: true } }));
    withHost(<DeployScreen data={{ pathname: '/', params: {}, search: {} }} />);

    await screen.findByText('This egg already pulls from Git');
    screen.getByText(/Set its AUTO_UPDATE variable to 0/);
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('https://gitlab.com/acme/api');
    expect((screen.getByLabelText('Branch') as HTMLInputElement).value).toBe('production');

    fireEvent.click(screen.getByRole('button', { name: 'Link the repository' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1]).toEqual({
        provider: 'gitlab',
        url: 'https://gitlab.com/acme/api',
        branch: 'production',
        directory: '/',
        shared_paths: ['.env', 'node_modules/', 'storage/', 'uploads/'],
        after_deploy: 'restart',
        command: null,
        auto_deploy: true,
        token: '',
        import_egg_token: true,
    });
});

test('keeps a saved token and sends no token for an SSH address', async () => {
    const api = mockApi(meta());
    withHost(<DeployScreen data={{ pathname: '/', params: {}, search: {} }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect((screen.getByLabelText('Access token') as HTMLInputElement).placeholder).toBe('Saved');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toMatchObject({ provider: 'github', token: MASK, shared_paths: ['.env', 'storage/'] });

    // Saving goes back to the overview.
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.change(await screen.findByLabelText('Address'), { target: { value: 'git@git.acme.lan:web/site.git' } });
    expect(screen.queryByLabelText('Access token')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put.mock.calls[1][1]).toMatchObject({ provider: 'generic', url: 'git@git.acme.lan:web/site.git', token: null });
});

test('shows deploys without the deploy and settings buttons to those who may only read', async () => {
    mockApi(meta({ can_deploy: false, can_manage: false, repository: { ...repository, webhook_secret: null } }));
    withHost(<DeployScreen data={{ pathname: '/', params: {}, search: {} }} />);

    await screen.findByText('Commit 1');
    expect(screen.queryByRole('button', { name: 'Deploy now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByText(repository.webhook_url)).toBeNull();
    expect(screen.queryByRole('button', { name: /Roll back/ })).toBeNull();
});
