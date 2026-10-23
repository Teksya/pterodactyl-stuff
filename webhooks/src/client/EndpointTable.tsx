import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { History, Power, Send, Webhook } from 'lucide-react';
import {
    Badge,
    DeleteAction,
    Dialog,
    DropdownMenuItem,
    EditAction,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    fromNow,
    httpErrorToHuman,
    RowActionButton,
    RowActions,
    RowActionsMenu,
    Spinner,
    Table,
    toast,
    Tooltip,
    type TableColumn,
} from '@pterodactyl/sdk';
import { deleteEndpoint, ROOT_KEY, testEndpoint, updateEndpoint, type Context } from './api';
import { endpointState, eventsSummary, providerLabel } from './present';
import type { Endpoint } from './types';

/** Webhooks with their state and actions: test, delivery log, edit, turn on or off, delete. */
export default function EndpointTable({
    endpoints,
    contextOf,
    canManage,
    showOwner = false,
    onEdit,
    onDeliveries,
    emptyDescription,
}: {
    endpoints: Endpoint[] | undefined;
    contextOf: (endpoint: Endpoint) => Context;
    canManage: boolean;
    showOwner?: boolean;
    onEdit: (endpoint: Endpoint) => void;
    onDeliveries: (endpoint: Endpoint) => void;
    emptyDescription: string;
}) {
    const queryClient = useQueryClient();
    const [testing, setTesting] = useState<number | null>(null);
    const [removing, setRemoving] = useState<Endpoint | null>(null);
    const [deleting, setDeleting] = useState(false);

    const columns = useMemo<TableColumn<Endpoint>[]>(() => {
        const test = async (endpoint: Endpoint) => {
            setTesting(endpoint.id);
            try {
                const result = await testEndpoint(contextOf(endpoint), endpoint.id);
                if (result.status === 'success') toast.success(`Test delivered to ${endpoint.name} (HTTP ${result.response_status}).`);
                else toast.error(`Test failed: ${result.error ?? 'no answer'}`);
            } catch (error) {
                toast.error(httpErrorToHuman(error));
            } finally {
                setTesting(null);
                await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            }
        };

        const toggle = async (endpoint: Endpoint) => {
            try {
                await updateEndpoint(contextOf(endpoint), endpoint.id, {
                    name: endpoint.name,
                    provider: endpoint.provider,
                    config: endpoint.config,
                    events: endpoint.events,
                    filters: endpoint.scope === 'admin' ? endpoint.filters : undefined,
                    enabled: !endpoint.enabled,
                });
                await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
                toast.success(endpoint.enabled ? `${endpoint.name} turned off.` : `${endpoint.name} turned on.`);
            } catch (error) {
                toast.error(httpErrorToHuman(error));
            }
        };

        return [
            {
                id: 'name',
                label: 'Name',
                sortValue: (endpoint) => endpoint.name,
                cell: (endpoint) => (
                    <div className='wh:min-w-0'>
                        <p className='wh:flex wh:items-center wh:gap-2'>
                            <span className='wh:truncate wh:font-medium'>{endpoint.name}</span>
                            <Badge size='sm' variant='soft' tone='neutral'>
                                {providerLabel(endpoint.provider)}
                            </Badge>
                        </p>
                        <p className='wh:truncate wh:text-xs wh:text-muted-foreground'>{endpoint.target}</p>
                    </div>
                ),
            },
            ...(showOwner
                ? [
                      {
                          id: 'owner',
                          label: 'Owner',
                          sortValue: (endpoint: Endpoint) => endpoint.server?.name ?? endpoint.user?.username ?? '',
                          cell: (endpoint: Endpoint) => (
                              <span className='wh:truncate wh:text-sm'>{endpoint.server?.name ?? endpoint.user?.username ?? '—'}</span>
                          ),
                      } satisfies TableColumn<Endpoint>,
                  ]
                : []),
            {
                id: 'events',
                label: 'Events',
                cell: (endpoint) => <span className='wh:whitespace-nowrap wh:text-sm'>{eventsSummary(endpoint.scope, endpoint.events)}</span>,
                headerClassName: 'wh:hidden wh:md:table-cell',
                cellClassName: 'wh:hidden wh:md:table-cell',
            },
            {
                id: 'state',
                label: 'State',
                cell: (endpoint) => {
                    const state = endpointState(endpoint);

                    return (
                        <Tooltip content={state.hint} disabled={!state.hint}>
                            <span>
                                <Badge size='sm' tone={state.tone}>
                                    {state.label}
                                </Badge>
                            </span>
                        </Tooltip>
                    );
                },
            },
            {
                id: 'last',
                label: 'Last delivery',
                sortValue: (endpoint) => endpoint.last_delivery_at ?? '',
                cell: (endpoint) => (
                    <span className='wh:whitespace-nowrap wh:text-xs wh:text-muted-foreground'>
                        {endpoint.last_delivery_at ? fromNow(endpoint.last_delivery_at) : 'Never'}
                    </span>
                ),
                headerClassName: 'wh:hidden wh:lg:table-cell',
                cellClassName: 'wh:hidden wh:lg:table-cell',
            },
            {
                id: 'actions',
                label: <span className='wh:sr-only'>Actions</span>,
                cell: (endpoint) => (
                    <RowActions>
                        {canManage && (
                            <RowActionButton
                                icon={Send}
                                label='Send a test'
                                aria-label={`Send a test to ${endpoint.name}`}
                                disabled={testing !== null}
                                disabledReason={testing === endpoint.id ? 'Sending…' : undefined}
                                onClick={() => void test(endpoint)}
                            />
                        )}
                        <RowActionButton icon={History} label='Delivery log' aria-label={`Delivery log of ${endpoint.name}`} onClick={() => onDeliveries(endpoint)} />
                        {canManage && <EditAction aria-label={`Edit ${endpoint.name}`} onClick={() => onEdit(endpoint)} />}
                        {canManage && <DeleteAction aria-label={`Delete ${endpoint.name}`} onClick={() => setRemoving(endpoint)} />}
                        {canManage && (
                            <RowActionsMenu label={`More actions for ${endpoint.name}`}>
                                <DropdownMenuItem icon={Power} onClick={() => void toggle(endpoint)}>
                                    {endpoint.enabled ? 'Turn off' : 'Turn on'}
                                </DropdownMenuItem>
                            </RowActionsMenu>
                        )}
                    </RowActions>
                ),
                headerClassName: 'wh:w-44 wh:text-right',
                cellClassName: 'wh:w-44 wh:text-right',
            },
        ];
    }, [canManage, contextOf, onDeliveries, onEdit, queryClient, showOwner, testing]);

    if (!endpoints) return <Spinner size='large' centered />;

    return (
        <>
            <Table
                rows={endpoints}
                columns={columns}
                keyOf={(endpoint) => String(endpoint.id)}
                emptyState={
                    <Empty size='compact'>
                        <EmptyHeader>
                            <EmptyMedia variant='icon'>
                                <Webhook />
                            </EmptyMedia>
                            <EmptyTitle>No webhooks</EmptyTitle>
                            <EmptyDescription>{emptyDescription}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                }
            />
            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title='Delete webhook'
                confirm='Delete'
                pending={deleting}
                onConfirmed={async () => {
                    if (!removing) return;
                    setDeleting(true);
                    try {
                        await deleteEndpoint(contextOf(removing), removing.id);
                        await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
                        toast.success(`${removing.name} deleted.`);
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    }
                    setDeleting(false);
                    setRemoving(null);
                }}
            >
                <strong>{removing?.name}</strong> stops receiving events, and its delivery log is deleted with it.
            </Dialog.Confirm>
        </>
    );
}
