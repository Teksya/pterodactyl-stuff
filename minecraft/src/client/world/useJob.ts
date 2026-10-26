import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast, useCurrentServerUuid, useExtensionJobProgress } from '@pterodactyl/sdk';
import { keys } from '../api';

const storageKey = (uuid: string) => `minecraft:snapshot-job:${uuid}`;

function remembered(uuid: string): string | undefined {
    try {
        return window.localStorage.getItem(storageKey(uuid)) ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * The snapshot or restore running in the background, followed until it ends; kept in the browser so
 * reloading the page finds it again.
 */
export function useSnapshotJob() {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [job, setJob] = useState<string | undefined>(() => remembered(uuid));
    const progress = useExtensionJobProgress(job, { serverUuid: uuid });
    const status = progress.data?.status;

    const follow = (id: string | undefined) => {
        setJob(id);
        try {
            if (id) window.localStorage.setItem(storageKey(uuid), id);
            else window.localStorage.removeItem(storageKey(uuid));
        } catch {
            // The job is followed until the page closes.
        }
    };

    useEffect(() => {
        if (status !== 'completed' && status !== 'failed') return;
        if (status === 'completed') toast.success(progress.data?.message || 'Done.');
        else toast.error(progress.data?.message || 'The snapshot job failed.');
        void client.invalidateQueries({ queryKey: keys.worlds(uuid) });
        void client.invalidateQueries({ queryKey: keys.world(uuid) });
        follow(undefined);
        // Once per finished job.
    }, [status]);

    // A job that expired or that this user may not see is forgotten.
    useEffect(() => {
        if (progress.isError) follow(undefined);
    }, [progress.isError]);

    return {
        running: job !== undefined && status !== 'completed' && status !== 'failed',
        percent: progress.data?.percent ?? 0,
        message: progress.data?.message ?? 'Queued…',
        follow,
    };
}
