import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, Label, Select, httpErrorToHuman, toast, useCurrentServerUuid } from '@pterodactyl/sdk';
import { ROOT_KEY, enableRcon } from './api';
import RestartNotice from './RestartNotice';
import type { RconStatus } from './types';

/**
 * Turns RCON on, on one of the server's allocation ports: the panel asks a running server everything
 * it reads from it over RCON. It needs a port of its own among the allocations.
 */
export default function RconDialog({ open, status, onClose }: { open: boolean; status: RconStatus; onClose: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [port, setPort] = useState(String(status.ports.includes(status.port ?? 0) ? status.port : (status.ports[0] ?? '')));
    // A password already in server.properties may be the user's own: kept unless they ask for a new one.
    const [password, setPassword] = useState<'keep' | 'new'>('keep');
    const newPassword = !status.password || password === 'new';
    const [turnedOn, setTurnedOn] = useState(false);
    const enable = useMutation({
        mutationFn: () => enableRcon(uuid, Number(port), newPassword),
        onSuccess: () => {
            setTurnedOn(true);
            void client.invalidateQueries({ queryKey: [...ROOT_KEY, uuid] });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
    const working = status.enabled && status.allocated;

    return (
        <Dialog open={open} onClose={onClose} title='RCON'>
            {turnedOn ? (
                <RestartNotice onRestarted={onClose}>RCON is on, on port {port}. It starts with the server's next start.</RestartNotice>
            ) : (
                <div className='mc:flex mc:flex-col mc:gap-4 mc:text-sm'>
                    <p className='mc:m-0'>
                        The panel asks a running server over RCON: who is online, a player&apos;s health and inventory, the time and the game rules, and to save its world before a snapshot. Without RCON it cannot know them while the server runs. Actions do not need it: they are commands typed in the console.
                    </p>
                    {status.state === 'ok' && <Alert type='success'>RCON answers on port {status.port}.</Alert>}
                    {status.state === 'error' && <Alert type='warning'>RCON is on, on port {status.port}, but asking it failed: {status.error}</Alert>}
                    {status.enabled && !status.allocated && (
                        <Alert type='warning'>Port {status.port} is not one of this server&apos;s allocations, so the panel may not reach it. Choose an allocated port below.</Alert>
                    )}
                    {status.ports.length === 0 ? (
                        <Alert type='info'>RCON needs a port of its own. Add an allocation in the Network tab (or ask your host for one), then come back.</Alert>
                    ) : (
                        <>
                            <div>
                                <Label htmlFor='mc-rcon-port'>Port</Label>
                                <Select id='mc-rcon-port' value={port} options={status.ports.map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => setPort(String(value))} />
                            </div>
                            <div>
                                {status.password && (
                                    <>
                                        <Label htmlFor='mc-rcon-password'>Password</Label>
                                        <Select
                                            id='mc-rcon-password'
                                            value={password}
                                            options={[
                                                { value: 'keep', label: 'Keep the current password' },
                                                { value: 'new', label: 'Replace it with a new random one' },
                                            ]}
                                            onChange={(value) => setPassword(value === 'new' ? 'new' : 'keep')}
                                        />
                                    </>
                                )}
                                <p className='mc:mt-1 mc:text-xs mc:text-muted-foreground'>
                                    {!newPassword
                                        ? 'The password in server.properties stays as it is.'
                                        : status.password
                                          ? 'The panel writes a new random password in server.properties: tools that use the current one will need the new one.'
                                          : 'The panel writes a new random password in server.properties. Nobody else needs it.'}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    {turnedOn ? 'Close' : 'Cancel'}
                </Button>
                {!turnedOn && status.ports.length > 0 && (
                    <Button isLoading={enable.isPending} disabled={port === ''} onClick={() => enable.mutate()}>
                        {working ? 'Use this port' : 'Turn on RCON'}
                    </Button>
                )}
            </Dialog.Footer>
        </Dialog>
    );
}
