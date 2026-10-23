import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ContentBox, Input, Label, ListToolbar, type ScreenComponentProps } from '@pterodactyl/sdk';
import { adminContextOf, deliveryLog, listAllEndpoints, ROOT_KEY } from './api';
import DeliveriesView from './DeliveriesView';
import DeliveryDetails from './DeliveryDetails';
import DeliveryTable from './DeliveryTable';
import EndpointEditor from './EndpointEditor';
import EndpointTable from './EndpointTable';
import StatusFilter from './StatusFilter';
import type { Delivery, DeliveryStatus, Endpoint } from './types';
import WebhooksManager from './WebhooksManager';

type Tab = 'panel' | 'server' | 'account' | 'log';

const TABS: { id: Tab; label: string }[] = [
    { id: 'panel', label: 'Panel' },
    { id: 'server', label: 'Server webhooks' },
    { id: 'account', label: 'Account webhooks' },
    { id: 'log', label: 'Delivery log' },
];

/** Every server's or every account's webhooks, which root administrators can fix, turn off or remove. */
function Overview({ scope }: { scope: 'server' | 'account' }) {
    const [view, setView] = useState<{ kind: 'list' } | { kind: 'edit' | 'deliveries'; endpoint: Endpoint }>({ kind: 'list' });
    const { data: endpoints } = useQuery({ queryKey: [...ROOT_KEY, 'all', scope], queryFn: () => listAllEndpoints(scope) });
    const onEdit = useCallback((endpoint: Endpoint) => setView({ kind: 'edit', endpoint }), []);
    const onDeliveries = useCallback((endpoint: Endpoint) => setView({ kind: 'deliveries', endpoint }), []);
    const back = () => setView({ kind: 'list' });

    if (view.kind === 'edit') return <EndpointEditor context={adminContextOf(view.endpoint)} endpoint={view.endpoint} onClose={back} />;
    if (view.kind === 'deliveries') return <DeliveriesView context={adminContextOf(view.endpoint)} endpoint={view.endpoint} canManage onBack={back} />;

    return (
        <ContentBox title={scope === 'server' ? 'Server webhooks' : 'Account webhooks'}>
            <p className='wh:mb-4 wh:text-sm wh:text-muted-foreground'>
                {scope === 'server'
                    ? 'Webhooks server owners and subusers created for their servers. Each server’s are also on its Webhooks tab.'
                    : 'Webhooks users created for their own accounts. Each user’s are also on their Webhooks tab.'}
            </p>
            <EndpointTable
                endpoints={endpoints}
                contextOf={adminContextOf}
                canManage
                showOwner
                onEdit={onEdit}
                onDeliveries={onDeliveries}
                emptyDescription={scope === 'server' ? 'No server has a webhook yet.' : 'No user has an account webhook yet.'}
            />
        </ContentBox>
    );
}

/** Every delivery of every webhook, newest first. */
function Log() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<DeliveryStatus | ''>('');
    const [event, setEvent] = useState('');
    const [open, setOpen] = useState<Delivery | null>(null);
    const query = useQuery({
        queryKey: [...ROOT_KEY, 'log', page, status, event],
        queryFn: () => deliveryLog(page, status, event.trim()),
        placeholderData: keepPreviousData,
        refetchInterval: 15_000,
    });

    return (
        <ContentBox title='Delivery log'>
            <ListToolbar summary={query.data ? `${query.data.meta.total} deliveries` : undefined}>
                <div className='wh:w-56'>
                    <Label htmlFor='wh-log-event' className='wh:sr-only'>
                        Event
                    </Label>
                    <Input
                        id='wh-log-event'
                        placeholder='Event, such as server:power'
                        value={event}
                        onChange={(change) => {
                            setEvent(change.target.value);
                            setPage(1);
                        }}
                    />
                </div>
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
                onOpen={setOpen}
                endpointColumn
                emptyDescription='Deliveries of every webhook show here.'
            />
            <DeliveryDetails context={{ kind: 'admin' }} delivery={open} canManage onClose={() => setOpen(null)} />
        </ContentBox>
    );
}

/** Admin → Webhooks. */
export default function AdminWebhooksScreen(_props: ScreenComponentProps) {
    const [tab, setTab] = useState<Tab>('panel');

    return (
        <div className='wh:flex wh:flex-col wh:gap-6'>
            <div role='tablist' aria-label='Webhooks' className='wh:flex wh:flex-wrap wh:gap-1 wh:border-b wh:border-border'>
                {TABS.map((item) => (
                    <button
                        key={item.id}
                        type='button'
                        role='tab'
                        id={`wh-tab-${item.id}`}
                        aria-selected={tab === item.id}
                        aria-controls={`wh-panel-${item.id}`}
                        onClick={() => setTab(item.id)}
                        className={`wh:-mb-px wh:cursor-pointer wh:border-0 wh:border-b-2 wh:border-solid wh:bg-transparent wh:px-3 wh:py-2 wh:text-sm wh:font-medium ${
                            tab === item.id ? 'wh:border-primary wh:text-foreground' : 'wh:border-transparent wh:text-muted-foreground wh:hover:text-foreground'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div role='tabpanel' id={`wh-panel-${tab}`} aria-labelledby={`wh-tab-${tab}`}>
                {tab === 'panel' && (
                    <WebhooksManager
                        context={{ kind: 'admin' }}
                        intro='Panel-wide webhooks: any event of any server, user, node or extension, optionally limited to some nodes or servers.'
                        emptyDescription='Create a webhook to send panel events to Discord, Slack, Teams, Telegram, ntfy or any HTTP endpoint.'
                    />
                )}
                {(tab === 'server' || tab === 'account') && <Overview key={tab} scope={tab} />}
                {tab === 'log' && <Log />}
            </div>
        </div>
    );
}
