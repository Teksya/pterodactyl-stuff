import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Pickaxe } from 'lucide-react';
import { Button, httpErrorToHuman, toast, useCurrentServerUuid, useServerPermission } from '@pterodactyl/sdk';
import { fileUrl, keys, uploadIcon } from '../api';

/** server-icon.png, or the pickaxe while the server has none. */
export function useServerIcon() {
    const uuid = useCurrentServerUuid() ?? '';

    return useQuery({
        queryKey: keys.icon(uuid),
        queryFn: () => fileUrl(uuid, '/server-icon.png').catch(() => null),
        enabled: uuid !== '',
        // The download link is signed for a short while.
        staleTime: 60_000,
    });
}

export function IconImage({ url }: { url: string | null | undefined }) {
    return url ? (
        <img src={url} alt='Server icon' className='mc:size-16 mc:[image-rendering:pixelated]' />
    ) : (
        <Pickaxe aria-hidden className='mc:size-8 mc:text-muted-foreground' />
    );
}

/** Uploads a picture as server-icon.png; the panel crops and scales it to 64 × 64. */
export function IconUpload() {
    const uuid = useCurrentServerUuid() ?? '';
    const canWrite = useServerPermission('file.update');
    const input = useRef<HTMLInputElement>(null);
    const client = useQueryClient();
    const upload = useMutation({
        mutationFn: (file: File) => uploadIcon(uuid, file),
        onSuccess: () => {
            toast.success('Icon saved. The server list shows it after the next restart.');
            void client.invalidateQueries({ queryKey: keys.icon(uuid) });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    if (!canWrite) return null;

    return (
        <>
            <input
                ref={input}
                type='file'
                accept='image/png,image/jpeg,image/webp,image/gif'
                className='mc:hidden'
                onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) upload.mutate(file);
                    event.currentTarget.value = '';
                }}
            />
            <Button size='small' isSecondary isLoading={upload.isPending} onClick={() => input.current?.click()}>
                <ImageUp aria-hidden className='mc:mr-1.5 mc:size-4' />
                Change the icon
            </Button>
        </>
    );
}
