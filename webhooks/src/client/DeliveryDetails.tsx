import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, formatDate, httpErrorToHuman, Spinner, toast } from '@pterodactyl/sdk';
import { getDelivery, redeliver, ROOT_KEY, type Context } from './api';
import { deliveryLabel, deliveryTone } from './present';
import type { Delivery } from './types';

function Block({ title, children }: { title: string; children: string }) {
    return (
        <div className='wh:flex wh:min-w-0 wh:flex-col wh:gap-1'>
            <p className='wh:text-xs wh:font-medium wh:uppercase wh:tracking-wide wh:text-muted-foreground'>{title}</p>
            <pre className='wh:max-h-72 wh:overflow-auto wh:whitespace-pre-wrap wh:break-all wh:rounded-md wh:border wh:border-border wh:bg-background wh:p-3 wh:font-mono wh:text-xs'>
                {children}
            </pre>
        </div>
    );
}

/** What was sent and what came back, with a Redeliver button. */
export default function DeliveryDetails({
    context,
    delivery,
    canManage,
    onClose,
}: {
    context: Context;
    delivery: Delivery | null;
    canManage: boolean;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);
    const { data: detail } = useQuery({
        queryKey: [...ROOT_KEY, 'delivery', delivery?.id ?? 0],
        queryFn: () => getDelivery(context, delivery!.id),
        enabled: delivery !== null,
    });

    const resend = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            const result = await redeliver(context, detail.id);
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            if (result.status === 'success') toast.success(`Delivered again (HTTP ${result.response_status}).`);
            else toast.error(result.error ?? 'The delivery failed again.');
            onClose();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    let response = detail?.response_body ?? '';
    try {
        response = response ? JSON.stringify(JSON.parse(response), null, 2) : '';
    } catch {
        // Not JSON: shown as received.
    }

    return (
        <Dialog open={delivery !== null} onClose={onClose} title={delivery ? delivery.event : 'Delivery'}>
            {!detail ? (
                <Spinner centered />
            ) : (
                <div className='wh:flex wh:flex-col wh:gap-4'>
                    <div className='wh:flex wh:flex-wrap wh:items-center wh:gap-2 wh:text-sm'>
                        <Badge tone={deliveryTone(detail.status)}>{deliveryLabel(detail.status)}</Badge>
                        {detail.is_test && <Badge tone='accent'>Test</Badge>}
                        {detail.response_status !== null && <span>HTTP {detail.response_status}</span>}
                        {detail.duration_ms !== null && <span className='wh:text-muted-foreground'>{detail.duration_ms} ms</span>}
                        <span className='wh:text-muted-foreground'>
                            {detail.attempts} attempt{detail.attempts === 1 ? '' : 's'} · {formatDate(detail.created_at, 'MMM D, YYYY HH:mm:ss')}
                        </span>
                    </div>
                    {detail.error && <Alert type='danger'>{detail.error}</Alert>}
                    <Block title='Payload'>{JSON.stringify(detail.payload, null, 2)}</Block>
                    {response && <Block title='Response'>{response}</Block>}
                </div>
            )}
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Close
                </Button>
                {canManage && (
                    <Button onClick={() => void resend()} isLoading={busy} disabled={!detail}>
                        Redeliver
                    </Button>
                )}
            </Dialog.Footer>
        </Dialog>
    );
}
