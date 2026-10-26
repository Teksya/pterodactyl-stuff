import { Alert, Button, useCurrentServerUuid, useExtensionAction, useSendServerPower, useServerPermission } from '@pterodactyl/sdk';
import type { ReactNode } from 'react';
import { useServerState } from './useServerState';

/** Says that a change waits for the next start, with a Restart button while the server runs. */
export default function RestartNotice({ children, onRestarted }: { children: ReactNode; onRestarted?: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const state = useServerState();
    const canRestart = useServerPermission('control.restart');
    const power = useSendServerPower(uuid);
    const restart = useExtensionAction('restart', async () => {
        await power.mutateAsync({ signal: 'restart' });
        onRestarted?.();
    });
    const running = state === 'running' || state === 'starting';

    return (
        <Alert type='warning' className='mc:mb-6'>
            <div className='mc:flex mc:flex-wrap mc:items-center mc:justify-between mc:gap-3'>
                <span>{children}</span>
                {running && canRestart && (
                    <Button size='small' isLoading={power.isPending} onClick={() => void restart()}>
                        Restart now
                    </Button>
                )}
            </div>
        </Alert>
    );
}
