import type { Deployment, Provider, Status, Trigger } from './types';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export const isSshUrl = (url: string) => /^[\w.-]+@[\w.-]+:(?!\d+\/)/.test(url.trim()) || /^ssh:\/\//i.test(url.trim());

/** The forge an address most likely belongs to, as the panel guesses it. */
export function guessProvider(url: string): Provider {
    const value = url.trim();
    if (isSshUrl(value)) return 'generic';
    let host = '';
    try {
        host = new URL(value).hostname.toLowerCase();
    } catch {
        return 'generic';
    }
    if (host.includes('github')) return 'github';
    if (host.includes('gitlab')) return 'gitlab';
    if (host === 'codeberg.org' || host === 'gitea.com' || host.includes('gitea') || host.includes('forgejo')) return 'gitea';

    return 'generic';
}

/** One path per line or comma, without blank ones. */
export function parsePaths(text: string): string[] {
    return [...new Set(text.split(/[\n,]/).map((path) => path.trim()).filter(Boolean))];
}

export const shortSha = (sha: string | null) => (sha ? sha.slice(0, 7) : '—');

export function statusOf(status: Status): { label: string; tone: Tone } {
    switch (status) {
        case 'success':
            return { label: 'Deployed', tone: 'success' };
        case 'failed':
            return { label: 'Failed', tone: 'danger' };
        case 'running':
            return { label: 'Running', tone: 'info' };
        default:
            return { label: 'Queued', tone: 'neutral' };
    }
}

export const TRIGGERS: Record<Trigger, string> = { manual: 'By hand', push: 'Push', rollback: 'Rollback' };

export const inProgress = (deployment: Pick<Deployment, 'status'>) => deployment.status === 'queued' || deployment.status === 'running';

/** How long a deploy took, such as 42 s or 2 min 5 s. */
export function duration(start: string | null, end: string | null): string | null {
    if (!start || !end) return null;
    const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));

    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Can the deploy's release be put back: a past success, other than the current one. */
export const canRollback = (deployment: Deployment) => deployment.status === 'success' && deployment.release !== null && !deployment.current && deployment.trigger !== 'rollback';

/** Where to paste the webhook, forge by forge. */
export function webhookSteps(provider: Provider): string[] {
    switch (provider) {
        case 'github':
            return [
                'In the repository, Settings → Webhooks → Add webhook.',
                'Payload URL: the URL below; Content type: application/json; Secret: the secret below.',
                'Keep "Just the push event", then Add webhook. GitHub sends a ping: it shows a green tick.',
            ];
        case 'gitlab':
            return ['In the project, Settings → Webhooks → Add new webhook.', 'URL: the URL below; Secret token: the secret below.', 'Tick Push events (optionally only this branch), then Add webhook.'];
        case 'gitea':
            return ['In the repository, Settings → Webhooks → Add webhook → Gitea (or Forgejo).', 'Target URL: the URL below; POST, application/json; Secret: the secret below.', 'Trigger on push events, then Add webhook.'];
        default:
            return ['From a CI job or a script, send a POST to the URL below.', 'Add the header X-Deploy-Token with the secret below. It deploys the branch\'s last commit.'];
    }
}

/** The text of a token field: empty for a saved one, which keeps it unless something is typed. */
export const tokenHelp = (saved: boolean, provider: Provider) =>
    saved
        ? 'Saved. Type a new one to replace it, or clear it.'
        : provider === 'github'
          ? 'A fine-grained personal access token with Contents: Read on the repository. Leave empty for a public repository.'
          : provider === 'gitlab'
            ? 'A project access token with read_repository and read_api. Leave empty for a public project.'
            : provider === 'gitea'
              ? 'An access token with repository: read. Leave empty for a public repository.'
              : 'For an HTTPS address: a token used as the password. For an SSH address, use the deploy key instead.';
