import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpErrorToHuman, toast, useCurrentServerUuid } from '@pterodactyl/sdk';
import { keys, playerAction, profile, worldAction, type PlayerAction, type WorldAction } from '../api';

/**
 * Runs an action on a player and shows how it went; their data is read again, half a second later
 * after a console command, so the server has applied it.
 */
export function usePlayerAction(player: string) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();

    return useMutation({
        mutationFn: (action: PlayerAction) => playerAction(uuid, player, action),
        onSuccess: ({ message, command }) => {
            toast.success(command ? `${message} ${command}` : message);
            void client.invalidateQueries({ queryKey: keys.players(uuid) });
            const refresh = () => client.fetchQuery({ queryKey: keys.player(uuid, player), queryFn: () => profile(uuid, player), staleTime: 0 });
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
            void client.invalidateQueries({ queryKey: keys.world(uuid) });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
}
