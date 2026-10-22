import { useMemo, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    formatDate,
    fromNow,
    RowActions,
    Spinner,
    Table,
    type TableColumn,
} from '@pterodactyl/sdk';
import type { SecurityKey } from './api';

/** The keys of an account, for the account screen and the admin's user tab alike. */
export default function KeyList({
    keys,
    actions,
    emptyDescription,
}: {
    keys: SecurityKey[] | undefined;
    actions: (key: SecurityKey) => ReactNode;
    emptyDescription: string;
}) {
    const columns = useMemo<TableColumn<SecurityKey>[]>(
        () => [
            {
                id: 'name',
                label: 'Name',
                sortValue: (key) => key.name,
                cell: (key) => <p className='sk:truncate sk:font-medium'>{key.name}</p>,
            },
            {
                id: 'created_at',
                label: 'Added',
                sortValue: (key) => key.created_at,
                cell: (key) => (
                    <time dateTime={key.created_at} className='sk:whitespace-nowrap sk:text-xs sk:text-muted-foreground'>
                        {formatDate(key.created_at, 'MMM D, YYYY HH:mm')}
                    </time>
                ),
                headerClassName: 'sk:hidden sk:md:table-cell',
                cellClassName: 'sk:hidden sk:md:table-cell',
            },
            {
                id: 'last_used_at',
                label: 'Last used',
                sortValue: (key) => key.last_used_at ?? '',
                cell: (key) => (
                    <span className='sk:whitespace-nowrap sk:text-xs sk:text-muted-foreground'>
                        {key.last_used_at ? fromNow(key.last_used_at) : 'Never'}
                    </span>
                ),
            },
            {
                id: 'actions',
                label: <span className='sk:sr-only'>Actions</span>,
                cell: (key) => <RowActions>{actions(key)}</RowActions>,
                headerClassName: 'sk:w-24 sk:text-right',
                cellClassName: 'sk:w-24 sk:text-right',
            },
        ],
        [actions]
    );

    if (!keys) return <Spinner size='large' centered />;

    return (
        <Table
            rows={keys}
            columns={columns}
            keyOf={(key) => String(key.id)}
            emptyState={
                <Empty size='compact'>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <KeyRound />
                        </EmptyMedia>
                        <EmptyTitle>No security keys</EmptyTitle>
                        <EmptyDescription>{emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            }
        />
    );
}
