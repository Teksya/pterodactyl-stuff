import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpErrorToHuman, toast, useCurrentServerUuid } from '@pterodactyl/sdk';
import { keys, playerAction, worldAction, type PlayerAction, type WorldAction } from '../api';

/**
 * Runs an action on a player and shows how it went; their data is read again, half a second later
 * after a command typed in the console, so the server has run it.
 */
export function usePlayerAction(player: string) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();

    return useMutation({
        mutationFn: (action: PlayerAction) => playerAction(uuid, player, action),
        onSuccess: ({ message, command }) => {
            toast.success(command ? `${message} ${command}` : message);
            void client.invalidateQueries({ queryKey: keys.players(uuid) });
            // A read already on its way began before the action: it is cancelled, not waited for.
            const refresh = () => client.invalidateQueries({ queryKey: keys.player(uuid, player) });
            if (command) window.setTimeout(() => void refresh(), 500);
            else void refresh();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
}

export function useWorldAction() {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();

    return useMutation({
        mutationFn: (action: WorldAction) => worldAction(uuid, action),
        onSuccess: ({ message, command }) => {
            toast.success(command ? `${message} ${command}` : message);
            window.setTimeout(() => void client.invalidateQueries({ queryKey: keys.world(uuid) }), command ? 500 : 0);
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
}
