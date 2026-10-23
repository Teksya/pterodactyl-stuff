import { useCallback, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
    Input,
    Label,
    ListToolbar,
    PageContentBlock,
    PageHeading,
    SubNavigation,
    type ScreenComponentProps,
    type SubNavigationProps,
} from '@pterodactyl/sdk';
import { adminContextOf, deliveryLog, listAllEndpoints, ROOT_KEY } from './api';
import DeliveriesView from './DeliveriesView';
import DeliveryDetails from './DeliveryDetails';
import DeliveryTable from './DeliveryTable';
import EndpointEditor from './EndpointEditor';
import EndpointTable from './EndpointTable';
import StatusFilter from './StatusFilter';
import type { Delivery, DeliveryStatus, Endpoint } from './types';
import WebhooksManager from './WebhooksManager';
import WingsDelayNotice from './WingsDelayNotice';

type NavItem = SubNavigationProps['items'][number];

const tab = (screen: string, label: string, order: number): NavItem => ({
    id: screen,
    label,
    destination: { extension: 'webhooks', screen },
    icon: null,
    group: null,
    order,
    exact: true,
});

// One screen each, so the panel's own sub-navigation draws them as it draws a node's or a server's tabs.
export const TABS: NavItem[] = [
    tab('admin-webhooks', 'Panel', 0),
    tab('admin-webhooks-servers', 'Server webhooks', 1),
    tab('admin-webhooks-accounts', 'Account webhooks', 2),
    tab('admin-webhooks-log', 'Delivery log', 3),
];

/** An admin page as the panel's own are laid out: heading, tabs, then the tab's content. */
function AdminPage({ description, children }: { description: string; children: ReactNode }) {
    return (
        <PageContentBlock title='Admin · Webhooks'>
            <PageHeading title='Webhooks' description={description} />
            <WingsDelayNotice />
            <SubNavigation className='wh:mb-6 wh:rounded-sm' items={TABS} />
            {children}
        </PageContentBlock>
    );
}

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
        <EndpointTable
            endpoints={endpoints}
            contextOf={adminContextOf}
            canManage
            showOwner
            onEdit={onEdit}
            onDeliveries={onDeliveries}
            emptyDescription={scope === 'server' ? 'No server has a webhook yet.' : 'No user has an account webhook yet.'}
        />
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
        <>
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
        </>
    );
}

/** Admin → Webhooks. */
export default function AdminWebhooksScreen(_props: ScreenComponentProps) {
    return (
        <AdminPage description='Panel-wide webhooks: any event of any server, user, node or extension, optionally limited to some nodes or servers.'>
            <WebhooksManager
                context={{ kind: 'admin' }}
                emptyDescription='Create a webhook to send panel events to Discord, Slack, Teams, Telegram, ntfy or any HTTP endpoint.'
            />
        </AdminPage>
    );
}

/** Admin → Webhooks → Server webhooks. */
export function AdminServersWebhooksScreen(_props: ScreenComponentProps) {
    return (
        <AdminPage description='Webhooks server owners and subusers created for their servers. Each server’s are also on its Webhooks tab.'>
            <Overview scope='server' />
        </AdminPage>
    );
}

/** Admin → Webhooks → Account webhooks. */
export function AdminAccountsWebhooksScreen(_props: ScreenComponentProps) {
    return (
        <AdminPage description='Webhooks users created for their own accounts. Each user’s are also on their Webhooks tab.'>
            <Overview scope='account' />
        </AdminPage>
    );
}

/** Admin → Webhooks → Delivery log. */
export function AdminDeliveryLogScreen(_props: ScreenComponentProps) {
    return (
        <AdminPage description='Every delivery of every webhook, newest first.'>
            <Log />
        </AdminPage>
    );
}
