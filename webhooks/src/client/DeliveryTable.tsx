import { useMemo, type ReactNode } from 'react';
import { Eye, History } from 'lucide-react';
import {
    Badge,
    Code,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    formatDate,
    fromNow,
    RowActionButton,
    RowActions,
    Spinner,
    Table,
    Tooltip,
    type TableColumn,
} from '@pterodactyl/sdk';
import { deliveryLabel, deliveryTone } from './present';
import type { Delivery, Page } from './types';

/** A page of deliveries, newest first; a row opens its details. */
export default function DeliveryTable({
    page,
    fetching,
    onPage,
    onOpen,
    endpointColumn = false,
    emptyDescription,
}: {
    page: Page<Delivery> | undefined;
    fetching: boolean;
    onPage: (page: number) => void;
    /** Without it, rows have no Details action. */
    onOpen?: (delivery: Delivery) => void;
    endpointColumn?: boolean;
    emptyDescription: ReactNode;
}) {
    const columns = useMemo<TableColumn<Delivery>[]>(
        () => [
            {
                id: 'created_at',
                label: 'When',
                cell: (delivery) => (
                    <Tooltip content={formatDate(delivery.created_at, 'MMM D, YYYY HH:mm:ss')}>
                        <time dateTime={delivery.created_at} className='wh:whitespace-nowrap wh:text-xs wh:text-muted-foreground'>
                            {fromNow(delivery.created_at)}
                        </time>
                    </Tooltip>
                ),
            },
            ...(endpointColumn
                ? [
                      {
                          id: 'endpoint',
                          label: 'Webhook',
                          cell: (delivery: Delivery) => <span className='wh:truncate wh:text-sm'>{delivery.endpoint?.name ?? '—'}</span>,
                      },
                  ]
                : []),
            {
                id: 'event',
                label: 'Event',
                cell: (delivery) => (
                    <span className='wh:flex wh:min-w-0 wh:items-center wh:gap-2'>
                        <Code className='wh:truncate wh:text-xs'>{delivery.event}</Code>
                        {delivery.is_test && (
                            <Badge size='sm' tone='accent'>
                                Test
                            </Badge>
                        )}
                    </span>
                ),
            },
            {
                id: 'status',
                label: 'Status',
                cell: (delivery) => (
                    <Tooltip content={delivery.error ?? deliveryLabel(delivery.status)} disabled={!delivery.error}>
                        <span>
                            <Badge size='sm' tone={deliveryTone(delivery.status)}>
                                {deliveryLabel(delivery.status)}
                                {delivery.response_status !== null && ` · ${delivery.response_status}`}
                            </Badge>
                        </span>
                    </Tooltip>
                ),
            },
            {
                id: 'duration',
                label: 'Time',
                cell: (delivery) => (
                    <span className='wh:whitespace-nowrap wh:text-xs wh:text-muted-foreground'>
                        {delivery.duration_ms !== null ? `${delivery.duration_ms} ms` : '—'}
                        {delivery.attempts > 1 && ` · ${delivery.attempts} tries`}
                    </span>
                ),
                headerClassName: 'wh:hidden wh:md:table-cell',
                cellClassName: 'wh:hidden wh:md:table-cell',
            },
            {
                id: 'actions',
                label: <span className='wh:sr-only'>Actions</span>,
                cell: (delivery) =>
                    onOpen && (
                        <RowActions>
                            <RowActionButton icon={Eye} label='Details' aria-label={`Details of ${delivery.event}`} onClick={() => onOpen(delivery)} />
                        </RowActions>
                    ),
                headerClassName: 'wh:w-16 wh:text-right',
                cellClassName: 'wh:w-16 wh:text-right',
            },
        ],
        [endpointColumn, onOpen]
    );

    if (!page) return <Spinner size='large' centered />;

    return (
        <Table
            rows={page.data}
            columns={columns}
            keyOf={(delivery) => String(delivery.id)}
            isFetching={fetching}
            pagination={
                page.meta.total > page.meta.per_page
                    ? {
                          page: page.meta.page,
                          perPage: page.meta.per_page,
                          total: page.meta.total,
                          count: page.data.length,
                          itemLabel: 'deliveries',
                          onPageSelect: onPage,
                      }
                    : undefined
            }
            emptyState={
                <Empty size='compact'>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <History />
                        </EmptyMedia>
                        <EmptyTitle>No deliveries</EmptyTitle>
                        <EmptyDescription>{emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            }
        />
    );
}
