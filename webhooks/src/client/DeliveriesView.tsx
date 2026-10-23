import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button, ContentBox, ListToolbar } from '@pterodactyl/sdk';
import { deliveriesKey, listDeliveries, type Context } from './api';
import DeliveryDetails from './DeliveryDetails';
import DeliveryTable from './DeliveryTable';
import StatusFilter from './StatusFilter';
import type { Delivery, DeliveryStatus, Endpoint } from './types';

/** One webhook's delivery log. */
export default function DeliveriesView({
    context,
    endpoint,
    canManage,
    canReadPayloads = true,
    onBack,
}: {
    context: Context;
    endpoint: Endpoint;
    canManage: boolean;
    canReadPayloads?: boolean;
    onBack: () => void;
}) {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<DeliveryStatus | ''>('');
    const [open, setOpen] = useState<Delivery | null>(null);
    const query = useQuery({
        queryKey: deliveriesKey(context, endpoint.id, page, status),
        queryFn: () => listDeliveries(context, endpoint.id, page, status),
        placeholderData: keepPreviousData,
        refetchInterval: 15_000,
    });

    return (
        <div className='wh:flex wh:flex-col wh:gap-6'>
            <div className='wh:flex wh:items-center wh:gap-3'>
                <Button.Text type='button' size='small' onClick={onBack}>
                    <ArrowLeft className='wh:size-4' aria-hidden />
                    Webhooks
                </Button.Text>
                <h2 className='wh:truncate wh:text-lg wh:font-semibold'>{endpoint.name}</h2>
            </div>
            <ContentBox title='Delivery log'>
                <ListToolbar summary={query.data ? `${query.data.meta.total} deliveries` : undefined}>
                    <StatusFilter
                        value={status}
                        onChange={(next) => {
                            setStatus(next);
                            setPage(1);
                        }}
                    />
                </ListToolbar>
                <DeliveryTable
                    page={query.data}
                    fetching={query.isFetching}
                    onPage={setPage}
                    onOpen={canReadPayloads ? setOpen : undefined}
                    emptyDescription='Events this webhook receives, and tests, show here.'
                />
            </ContentBox>
            <DeliveryDetails context={context} delivery={open} canManage={canManage} onClose={() => setOpen(null)} />
        </div>
    );
}
