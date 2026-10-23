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
                    intro='Send this server’s events (power, crashes, backups, console, files, subusers…) to Discord, Slack, Telegram or any HTTP endpoint.'
                    emptyDescription='Create a webhook to be told when this server starts, crashes, finishes a backup and more.'
                />
            ) : (
                <Spinner size='large' centered />
            )}
        </ServerContentBlock>
    );
}
