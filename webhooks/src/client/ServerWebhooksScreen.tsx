import { ServerContentBlock, Spinner, useCurrentServerUuid, type ScreenComponentProps } from '@pterodactyl/sdk';
import WebhooksManager from './WebhooksManager';

/** Server → Webhooks. */
export default function ServerWebhooksScreen(_props: ScreenComponentProps) {
    const uuid = useCurrentServerUuid();

    return (
        <ServerContentBlock title='Webhooks'>
            {uuid ? (
                <WebhooksManager
                    context={{ kind: 'server', uuid }}
                    emptyDescription='Create a webhook to send this server’s power, crash, backup, console and file events to Discord, Slack, Telegram or any HTTP endpoint.'
                />
            ) : (
                <Spinner size='large' centered />
            )}
        </ServerContentBlock>
    );
}
