import { useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderInput, FolderMinus } from 'lucide-react';
import { cn, DropdownMenuItem, ListRow, RowActionsMenu, type SdkServer } from '@pterodactyl/sdk';
import { Slot, View, type UiTone } from '@pterodactyl/sdk/theme';
import type { Entry, Folder } from './types';

export const DRAG_TYPE = 'application/x-server-organizer';

/**
 * The power state the server's card fetched: the row reads the card's own query rather than
 * asking Wings again. Unknown until the card has it.
 */
function usePowerState(uuid: string): string | null {
    const cache = useQueryClient().getQueryCache();

    return useSyncExternalStore(
        (notify) => cache.subscribe(notify),
        () => {
            const query = cache.findAll({
                predicate: ({ queryKey }) => {
                    const key = queryKey[0] as { _id?: string; path?: { server_uuid?: string } } | undefined;

                    return key?._id === 'clientGetServerResources' && key.path?.server_uuid === uuid;
                },
            })[0];
            const state = (query?.state.data as { attributes?: { current_state?: string } } | undefined)?.attributes?.current_state;

            return typeof state === 'string' ? state : null;
        }
    );
}

/** As the panel's own list: running is good, starting and stopping on their way, anything else down. */
function tone(server: SdkServer, power: string | null): UiTone | undefined {
    if (server.attributes.status === 'suspended' || power === 'offline') return 'danger';
    if (power === 'running') return 'success';

    return power ? 'warning' : undefined;
}

export default function ServerRow({
    entry,
    folders,
    folder,
    draggable,
    onMove,
    onDropBefore,
}: {
    entry: Entry;
    folders: Folder[];
    /** The folder the server is in. */
    folder: string | null;
    draggable: boolean;
    onMove: (uuid: string, folder: string | null) => void;
    /** A server dropped on this row goes before it. */
    onDropBefore: (uuid: string, before: string) => void;
}) {
    const { server } = entry;
    const { uuid, identifier, name } = server.attributes;
    const power = usePowerState(uuid);
    const [over, setOver] = useState(false);

    return (
        <div
            className={cn('so:flex so:items-center so:gap-2 so:rounded-sm', over && 'so:outline-2 so:outline-offset-2 so:outline-primary')}
            draggable={draggable}
            onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, uuid);
                event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
                if (!draggable || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.stopPropagation();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
                const dragged = event.dataTransfer.getData(DRAG_TYPE);
                setOver(false);
                if (!dragged) return;
                event.preventDefault();
                event.stopPropagation();
                if (dragged !== uuid) onDropBefore(dragged, uuid);
            }}
        >
            <ListRow
                destination={{ to: '/server/$id', params: { id: identifier } }}
                aria-label={name}
                status={tone(server, power)}
                className='so:grid so:min-w-0 so:flex-1 so:grid-cols-12 so:gap-4'
            >
                <Slot name='dashboard.serverRow.before' data={server} />
                <div className='so:col-span-12'>
                    <View name='dashboard.serverCard' server={server} />
                </div>
                <Slot name='dashboard.serverRow.metrics.after' data={server} />
                <Slot name='dashboard.serverRow.after' data={server} />
            </ListRow>
            {folders.length > 0 && (
                <RowActionsMenu label={`Move ${name} to a folder`}>
                    {folders.map((item) => (
                        <DropdownMenuItem key={item.id} icon={FolderInput} checked={item.id === folder} onClick={() => onMove(uuid, item.id)}>
                            {item.name}
                        </DropdownMenuItem>
                    ))}
                    {folder && (
                        <DropdownMenuItem icon={FolderMinus} onClick={() => onMove(uuid, null)}>
                            Remove from folder
                        </DropdownMenuItem>
                    )}
                </RowActionsMenu>
            )}
        </div>
    );
}
