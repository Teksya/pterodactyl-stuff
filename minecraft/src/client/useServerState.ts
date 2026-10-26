import { useState } from 'react';
import { SocketEvent, useCurrentServerUuid, useServerResources, useServerWebsocketEvent } from '@pterodactyl/sdk';

export type ServerState = 'offline' | 'stopped' | 'starting' | 'running' | 'stopping';

/** The server's power state: the dashboard's cached reading, then each change the console socket reports. */
export function useServerState(): ServerState | undefined {
    const uuid = useCurrentServerUuid() ?? '';
    const polled = useServerResources(uuid, (data) => data.attributes.current_state).data;
    const [live, setLive] = useState<ServerState | undefined>(undefined);

    useServerWebsocketEvent(SocketEvent.STATUS, (state) => setLive(state as ServerState));

    return live ?? polled;
}
