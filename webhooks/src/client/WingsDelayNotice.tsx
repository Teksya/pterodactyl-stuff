import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Code } from '@pterodactyl/sdk';
import { getMeta, metaKey } from './api';

const IGNORED_KEY = 'webhooks:wings-delay-ignored';

const readIgnored = (): string | null => {
    try {
        return localStorage.getItem(IGNORED_KEY);
    } catch {
        return null;
    }
};

/**
 * Tells administrators that a node's Wings reports power actions, console commands and SFTP
 * late. Ignoring it holds for the same nodes in this browser; another node reporting late
 * shows it again.
 */
export default function WingsDelayNotice() {
    const context = { kind: 'admin' } as const;
    const { data: meta } = useQuery({ queryKey: metaKey(context), queryFn: () => getMeta(context) });
    const [ignored, setIgnored] = useState(readIgnored);
    const delays = meta?.wings_delays ?? [];
    const signature = delays.map((delay) => delay.node_id).join(',');

    if (delays.length === 0 || ignored === signature) return null;

    const ignore = () => {
        try {
            localStorage.setItem(IGNORED_KEY, signature);
        } catch {
            // Without storage it stays ignored until the page reloads.
        }
        setIgnored(signature);
    };

    const nodes = delays.map((delay) => `${delay.node} (${delay.seconds} s)`).join(', ');

    return (
        <Alert type='warning' title='Wings reports server activity late' className='wh:mb-6'>
            <p>
                {delays.length === 1 ? 'The node' : 'The nodes'} {nodes} held power actions, console commands and SFTP events that long before
                sending them to the panel, so webhooks hear of them that late. In <Code>/etc/pterodactyl/config.yml</Code> on{' '}
                {delays.length === 1 ? 'that node' : 'each of them'}, set <Code>activity_send_interval: 5</Code> under <Code>system:</Code>, then
                restart Wings.
            </p>
            <div className='wh:mt-3'>
                <Button.Text type='button' size='small' onClick={ignore}>
                    Ignore
                </Button.Text>
            </div>
        </Alert>
    );
}
