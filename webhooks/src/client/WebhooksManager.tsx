import { useCallback, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, ContentBox, ListToolbar, NewButton, Spinner } from '@pterodactyl/sdk';
import { endpointsKey, getMeta, listEndpoints, metaKey, type Context } from './api';
import DeliveriesView from './DeliveriesView';
import EndpointEditor from './EndpointEditor';
import EndpointTable from './EndpointTable';
import type { Endpoint } from './types';

type View = { kind: 'list' } | { kind: 'edit'; endpoint?: Endpoint } | { kind: 'deliveries'; endpoint: Endpoint };

/** One owner's webhooks: the list, the editor and the delivery log, in place of each other. */
export default function WebhooksManager({ context, intro, emptyDescription }: { context: Context; intro: ReactNode; emptyDescription: string }) {
    const [view, setView] = useState<View>({ kind: 'list' });
    const { data: meta } = useQuery({ queryKey: metaKey(context), queryFn: () => getMeta(context) });
    const { data: endpoints } = useQuery({ queryKey: endpointsKey(context), queryFn: () => listEndpoints(context) });
    const contextOf = useCallback(() => context, [context]);
    const onEdit = useCallback((endpoint: Endpoint) => setView({ kind: 'edit', endpoint }), []);
    const onDeliveries = useCallback((endpoint: Endpoint) => setView({ kind: 'deliveries', endpoint }), []);
    const back = () => setView({ kind: 'list' });

    if (!meta) return <Spinner size='large' centered />;

    if (view.kind === 'edit') return <EndpointEditor context={context} endpoint={view.endpoint} onClose={back} />;
    if (view.kind === 'deliveries') return <DeliveriesView context={context} endpoint={view.endpoint} canManage={meta.can_manage} canReadPayloads={meta.can_read_payloads} onBack={back} />;

    const full = meta.limit !== null && meta.count >= meta.limit;

    return (
        <div className='wh:flex wh:flex-col wh:gap-6'>
            {!meta.enabled && <Alert type='warning'>The administrator has turned these webhooks off: they keep their settings but receive nothing.</Alert>}
            <ContentBox title='Webhooks'>
                <p className='wh:mb-4 wh:text-sm wh:text-muted-foreground'>{intro}</p>
                <ListToolbar summary={meta.limit !== null ? `${meta.count} of ${meta.limit} webhooks` : `${meta.count} webhook${meta.count === 1 ? '' : 's'}`}>
                    {meta.can_manage && (
                        <NewButton onClick={() => setView({ kind: 'edit' })} disabled={full || !meta.enabled || meta.providers.length === 0}>
                            New webhook
                        </NewButton>
                    )}
                </ListToolbar>
                <EndpointTable
                    endpoints={endpoints}
                    contextOf={contextOf}
                    canManage={meta.can_manage}
                    onEdit={onEdit}
                    onDeliveries={onDeliveries}
                    emptyDescription={emptyDescription}
                />
            </ContentBox>
        </div>
    );
}
