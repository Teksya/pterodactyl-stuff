import { PageContentBlock, type ScreenComponentProps } from '@pterodactyl/sdk';
import WebhooksManager from './WebhooksManager';

/** Account → Webhooks. */
export default function AccountWebhooksScreen(_props: ScreenComponentProps) {
    return (
        <PageContentBlock title='Webhooks'>
            <div className='wh:my-10'>
                <WebhooksManager
                    context={{ kind: 'account' }}
                    intro='Be told about your account: sign-ins and failed attempts, password, email and two-factor changes, API and SSH keys.'
                    emptyDescription='Create a webhook to be alerted when someone signs in to your account or changes its security.'
                />
            </div>
        </PageContentBlock>
    );
}
