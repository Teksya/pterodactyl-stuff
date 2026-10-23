import { Spinner, TitledGreyBox, useCurrentResource, type ScreenComponentProps } from '@pterodactyl/sdk';
import WebhooksManager from './WebhooksManager';

/** Admin → Servers → a server → Webhooks: the server's own webhooks, as its owner sees them. */
export function AdminServerWebhooksScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const serverId = resource?.kind === 'admin.server' ? resource.resource.attributes.id : 0;
    if (!serverId) return <Spinner size='large' centered />;

    return (
        <TitledGreyBox title='Webhooks'>
            <WebhooksManager context={{ kind: 'admin-server', serverId }} emptyDescription='This server has no webhook. Its owner and subusers manage them.' />
        </TitledGreyBox>
    );
}

/** Admin → Users → a user → Webhooks: the account webhooks of the user. */
export function AdminUserWebhooksScreen(_props: ScreenComponentProps) {
    const resource = useCurrentResource();
    const userId = resource?.kind === 'admin.user' ? resource.resource.attributes.id : 0;
    if (!userId) return <Spinner size='large' centered />;

    return (
        <TitledGreyBox title='Webhooks'>
            <WebhooksManager context={{ kind: 'admin-user', userId }} emptyDescription='This user has no account webhook.' />
        </TitledGreyBox>
    );
}
