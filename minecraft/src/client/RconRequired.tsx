import type { ReactNode } from 'react';
import { Alert, Button, useCurrentServerUuid, useExtensionAction, useSendServerPower, useServerPermission } from '@pterodactyl/sdk';
import type { RconStatus } from './types';

interface Props {
    rcon: Pick<RconStatus, 'state' | 'error'>;
    /** What needs RCON, as a sentence: "Knowing who is online needs RCON while the server runs." */
    children: ReactNode;
    /** Opens the RCON settings; absent when the user may not change them. */
    onSettings?: () => void;
}

/**
 * Where the running server could not be asked: why RCON did not answer, and how to have it answer
 * (turn it on, or restart the server it was turned on for). The panel guesses nothing in its place.
 */
export default function RconRequired({ rcon, children, onSettings }: Props) {
    const uuid = useCurrentServerUuid() ?? '';
    const canRestart = useServerPermission('control.restart');
    const power = useSendServerPower(uuid);
    const restart = useExtensionAction('restart', async () => {
        await power.mutateAsync({ signal: 'restart' });
    });

    return (
        <Alert type='warning'>
            <div className='mc:flex mc:flex-col mc:gap-2'>
                <span className='mc:font-medium'>{children}</span>
                {rcon.state === 'error' ? (
                    <span>RCON is turned on, but asking it failed: {rcon.error}</span>
                ) : (
                    <span>RCON is off for this server.{onSettings ? '' : ' Someone who may change server.properties can turn it on from the Players page.'}</span>
                )}
                {(onSettings || (rcon.state === 'error' && canRestart)) && (
                    <div className='mc:flex mc:flex-wrap mc:gap-2'>
                        {onSettings && (
                            <Button size='small' onClick={onSettings}>
                                {rcon.state === 'off' ? 'Turn on RCON…' : 'RCON settings…'}
                            </Button>
                        )}
                        {rcon.state === 'error' && canRestart && (
                            <Button size='small' isSecondary isLoading={power.isPending} onClick={() => void restart()}>
                                Restart the server
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </Alert>
    );
}
