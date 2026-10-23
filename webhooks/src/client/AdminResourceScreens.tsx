import { Spinner, useCurrentResource, type ScreenComponentProps } from '@pterodactyl/sdk';
import WebhooksManager from './WebhooksManager';

/** Admin → Servers → a server → Webhooks: the server's own webhooks, as its owner sees them. */
export function AdminServerWebhooksScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const serverId = resource?.kind === 'admin.server' ? resource.resource.attributes.id : 0;
    if (!serverId) return <Spinner size='large' centered />;

    return (
        <WebhooksManager
            context={{ kind: 'admin-server', serverId }}
            intro='The webhooks of this server, which its owner and subusers manage. Panel-wide webhooks are under Admin → Webhooks.'
            emptyDescription='This server has no webhook.'
        />
    );
}

/** Admin → Users → a user → Webhooks: the account webhooks of the user. */
export function AdminUserWebhooksScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const userId = resource?.kind === 'admin.user' ? resource.resource.attributes.id : 0;
    if (!userId) return <Spinner size='large' centered />;

    return (
        <WebhooksManager
            context={{ kind: 'admin-user', userId }}
            intro='The webhooks this user set up for the events of their account.'
            emptyDescription='This user has no account webhook.'
        />
    );
}
