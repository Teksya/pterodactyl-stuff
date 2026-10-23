import type { DeliveryStatus, Endpoint, Scope, Severity } from './types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export const PROVIDER_LABELS: Record<string, string> = {
    discord: 'Discord',
    slack: 'Slack',
    teams: 'Teams',
    telegram: 'Telegram',
    ntfy: 'ntfy',
    gotify: 'Gotify',
    pushover: 'Pushover',
    matrix: 'Matrix',
    http: 'HTTP',
    custom: 'Custom',
};

export const providerLabel = (id: string) => PROVIDER_LABELS[id] ?? id;

export const severityTone = (severity: Severity): Tone =>
    severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : severity === 'success' ? 'success' : 'info';

export const deliveryTone = (status: DeliveryStatus): Tone =>
    status === 'success' ? 'success' : status === 'failed' ? 'danger' : status === 'pending' ? 'info' : 'neutral';

export const deliveryLabel = (status: DeliveryStatus) =>
    ({ success: 'Delivered', failed: 'Failed', pending: 'Pending', skipped: 'Skipped' })[status];

/** The state a list shows for an endpoint. */
export function endpointState(endpoint: Endpoint): { label: string; tone: Tone; hint?: string } {
    if (!endpoint.enabled) {
        return endpoint.disabled_reason
            ? { label: 'Turned off', tone: 'danger', hint: endpoint.disabled_reason }
            : { label: 'Off', tone: 'neutral' };
    }
    if (endpoint.last_status === 'failed') {
        return { label: 'Failing', tone: 'warning', hint: `${endpoint.failure_count} failed in a row` };
    }

    return { label: 'Active', tone: 'success' };
}

/** The patterns that mean "everything this kind of webhook can receive". */
export const allEvents = (scope: Scope): string[] =>
    scope === 'admin' ? ['*'] : scope === 'server' ? ['server:*'] : ['user:*', 'auth:*'];

export const isAllEvents = (scope: Scope, events: string[]) => {
    const all = allEvents(scope);

    return all.every((pattern) => events.includes(pattern));
};

export function eventsSummary(scope: Scope, events: string[]): string {
    if (isAllEvents(scope, events)) return 'All events';

    return events.length === 1 ? '1 event' : `${events.length} events`;
}

export const isMonitored = (key: string) => key.startsWith('server:state.') || key.startsWith('server:resources.');

/** Whether a subscription pattern selects a key, as the server matches it. */
export function patternMatches(pattern: string, key: string): boolean {
    if (pattern === key) return true;
    if (!pattern.includes('*')) return false;

    const expression = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');

    return new RegExp(`^${expression}$`).test(key);
}
