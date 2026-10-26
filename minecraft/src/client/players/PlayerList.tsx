import { useState } from 'react';
import { Ban, CheckCircle, Eye, LogOut, ShieldAlert, ShieldCheck, Check, X } from 'lucide-react';
import { Badge, Button, Dialog, Input, Table, Tooltip, cn, fromNow, useServerPermission, type TableColumn } from '@pterodactyl/sdk';
import { Head } from '../textures';
import type { Player } from '../types';
import { BAN_REASON, KICK_REASON, OpDialog, TextDialog } from './PlayerActions';
import { usePlayerAction } from './usePlayerAction';

export type Filter = 'all' | 'online' | 'offline' | 'op' | 'banned';

// The Pelican plugin's tabs, each with its count.
const FILTERS: { value: Filter; label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; test: (player: Player) => boolean }[] = [
    { value: 'all', label: 'All', tone: 'neutral', test: () => true },
    { value: 'online', label: 'Online', tone: 'success', test: (player) => player.online },
    { value: 'offline', label: 'Offline', tone: 'neutral', test: (player) => !player.online },
    { value: 'op', label: 'OP', tone: 'warning', test: (player) => player.op !== null },
    { value: 'banned', label: 'Banned', tone: 'danger', test: (player) => player.banned !== null },
];

interface Props {
    players: Player[];
    onView: (uuid: string) => void;
}

/** Everyone the server knows, as the plugin's player list: tabs by state, a search, a table with actions. */
export default function PlayerList({ players, onView }: Props) {
    const canManage = useServerPermission('ext.minecraft.manage');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const needle = search.trim().toLowerCase();
    const test = FILTERS.find((entry) => entry.value === filter)!.test;
    const shown = players.filter((player) => test(player) && (!needle || (player.name ?? '').toLowerCase().includes(needle) || player.uuid.startsWith(needle)));

    const columns: TableColumn<Player>[] = [
        { id: 'avatar', label: <span className='mc:sr-only'>Avatar</span>, headerClassName: 'mc:w-12', cell: (player) => <Head uuid={player.uuid} name={player.name} size={32} /> },
        {
            id: 'name',
            label: 'Username',
            sortValue: (player) => (player.name ?? player.uuid).toLowerCase(),
            cell: (player) => (
                <button type='button' onClick={() => onView(player.uuid)} className='mc:flex mc:cursor-pointer mc:flex-col mc:items-start mc:border-0 mc:bg-transparent mc:p-0 mc:text-left'>
                    <span className='mc:text-sm mc:font-medium mc:text-foreground'>{player.name ?? player.uuid.slice(0, 8)}</span>
                    <span className='mc:text-xs mc:text-muted-foreground'>{player.online ? 'Online now' : player.lastSeen ? `Seen ${fromNow(player.lastSeen)}` : 'Never joined'}</span>
                </button>
            ),
        },
        {
            id: 'status',
            label: 'Status',
            sortValue: (player) => (player.banned !== null ? 0 : player.online ? 1 : 2),
            cell: (player) => (
                <Badge size='sm' variant='soft' tone={player.banned !== null ? 'danger' : player.online ? 'success' : 'neutral'}>
                    {player.banned !== null ? 'Banned' : player.online ? 'Online' : 'Offline'}
                </Badge>
            ),
        },
        {
            id: 'op',
            label: 'Operator',
            sortValue: (player) => player.op ?? -1,
            headerClassName: 'mc:hidden mc:sm:table-cell',
            cellClassName: 'mc:hidden mc:sm:table-cell',
            cell: (player) =>
                player.op !== null ? (
                    <Tooltip content={`Operator level ${player.op}`}>
                        <Check aria-label={`Operator, level ${player.op}`} className='mc:size-5 mc:text-success' />
                    </Tooltip>
                ) : (
                    <X aria-label='Not an operator' className='mc:size-5 mc:text-danger' />
                ),
        },
        {
            id: 'actions',
            label: <span className='mc:sr-only'>Actions</span>,
            cellClassName: 'mc:text-right',
            cell: (player) => <RowButtons player={player} canManage={canManage} onView={() => onView(player.uuid)} />,
        },
    ];

    return (
        <div className='mc:flex mc:min-w-0 mc:flex-col mc:gap-3'>
            <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-3'>
                <div className='mc:flex mc:flex-wrap mc:gap-1 mc:rounded-lg mc:border mc:border-border mc:bg-card mc:p-1' role='tablist' aria-label='Show'>
                    {FILTERS.map((entry) => (
                        <button
                            key={entry.value}
                            type='button'
                            role='tab'
                            aria-selected={filter === entry.value}
                            onClick={() => setFilter(entry.value)}
                            className={cn(
                                'mc:flex mc:cursor-pointer mc:items-center mc:gap-2 mc:rounded-md mc:border-0 mc:px-3 mc:py-1.5 mc:text-sm mc:font-medium',
                                filter === entry.value ? 'mc:bg-secondary mc:text-foreground' : 'mc:bg-transparent mc:text-muted-foreground mc:hover:text-foreground'
                            )}
                        >
                            {entry.label}
                            <Badge size='sm' variant='soft' tone={entry.tone}>
                                {players.filter(entry.test).length}
                            </Badge>
                        </button>
                    ))}
                </div>
                <Input aria-label='Search players' placeholder='Search' value={search} onChange={(event) => setSearch(event.currentTarget.value)} className='mc:ml-auto mc:w-full mc:sm:w-56' />
            </div>
            <Table rows={shown} columns={columns} keyOf={(player) => player.uuid} emptyState={players.length === 0 ? 'Nobody joined yet.' : 'No player matches.'} />
        </div>
    );
}

/** The row's actions, as in the plugin: View, OP or DEOP, Kick, Ban or Unban. */
function RowButtons({ player, canManage, onView }: { player: Player; canManage: boolean; onView: () => void }) {
    const action = usePlayerAction(player.uuid);
    const [dialog, setDialog] = useState<'op' | 'kick' | 'ban' | 'pardon' | null>(null);
    const run = (input: Parameters<typeof action.mutateAsync>[0]) => action.mutateAsync(input).then(() => setDialog(null), () => {});
    const name = player.name ?? 'this player';
    const isOp = player.op !== null;

    return (
        <div className='mc:inline-flex mc:flex-wrap mc:items-center mc:justify-end mc:gap-2'>
            <Button.Text size='xsmall' aria-label={`View ${name}`} onClick={onView}>
                <Eye aria-hidden className='mc:mr-1 mc:size-4' />
                View
            </Button.Text>
            {canManage && (
                <>
                    <Button size='xsmall' color={isOp ? 'orange' : 'primary'} aria-label={`${isOp ? 'DEOP' : 'OP'} ${name}`} onClick={() => setDialog('op')}>
                        {isOp ? <ShieldAlert aria-hidden className='mc:mr-1 mc:size-4' /> : <ShieldCheck aria-hidden className='mc:mr-1 mc:size-4' />}
                        {isOp ? 'DEOP' : 'OP'}
                    </Button>
                    <Tooltip content={player.online ? 'Kick' : `${name} is offline.`}>
                        <span className='mc:inline-flex'>
                            <Button size='xsmall' color='red' aria-label={`Kick ${name}`} disabled={!player.online} onClick={() => setDialog('kick')}>
                                <LogOut aria-hidden className='mc:mr-1 mc:size-4' />
                                Kick
                            </Button>
                        </span>
                    </Tooltip>
                    {player.banned !== null ? (
                        <Button size='xsmall' color='green' aria-label={`Unban ${name}`} onClick={() => setDialog('pardon')}>
                            <CheckCircle aria-hidden className='mc:mr-1 mc:size-4' />
                            Unban
                        </Button>
                    ) : (
                        <Button size='xsmall' color='red' aria-label={`Ban ${name}`} onClick={() => setDialog('ban')}>
                            <Ban aria-hidden className='mc:mr-1 mc:size-4' />
                            Ban
                        </Button>
                    )}
                    <OpDialog open={dialog === 'op'} player={player} pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: isOp ? 'deop' : 'op' })} />
                    <Dialog.Confirm open={dialog === 'kick'} title={`Kick ${name}?`} confirm='Kick' pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: 'kick', reason: KICK_REASON })}>
                        They leave the server with the message “{KICK_REASON}”, and can join again.
                    </Dialog.Confirm>
                    <TextDialog key={`ban-${dialog === 'ban'}`} open={dialog === 'ban'} title={`Ban ${name}`} label='Reason' initial={BAN_REASON} confirm='Ban' pending={action.isPending} onClose={() => setDialog(null)} onRun={(reason) => run({ action: 'ban', reason })} />
                    <Dialog.Confirm open={dialog === 'pardon'} title={`Unban ${name}?`} confirm='Unban' pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: 'pardon' })}>
                        They can join the server again.
                    </Dialog.Confirm>
                </>
            )}
        </div>
    );
}
