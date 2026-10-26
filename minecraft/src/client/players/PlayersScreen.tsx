import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, MessageSquareText, MoreHorizontal, Network, Users, Zap } from 'lucide-react';
import {
    Alert,
    Button,
    DeleteAction,
    Dialog,
    DropdownMenu,
    DropdownMenuItem,
    Input,
    Label,
    Select,
    ServerContentBlock,
    Spinner,
    Stat,
    httpErrorToHuman,
    toast,
    useCurrentServer,
    useCurrentServerUuid,
    usePanelNavigate,
    useServerPermission,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { addByName, broadcast, changeIpBan, enableRcon, ipBans, keys, overview, players as fetchPlayers, type ListName } from '../api';
import { motdLines } from '../properties/motd';
import RestartNotice from '../RestartNotice';
import type { Overview, RconStatus } from '../types';
import PlayerDetail from './PlayerDetail';
import PlayerList from './PlayerList';

/**
 * Server → Players, as the Pelican plugin's pages: the server's counts over the player list, and a
 * player's own page in its place once one is picked.
 */
export default function PlayersScreen({ data }: ScreenComponentProps) {
    const uuid = useCurrentServerUuid() ?? '';
    const id = useCurrentServer((server) => server.attributes.identifier) ?? '';
    const navigate = usePanelNavigate();
    const canManage = useServerPermission('ext.minecraft.manage');
    const canEditFiles = useServerPermission('file.update');
    const [rconOpen, setRconOpen] = useState(false);
    const search = data.search as Record<string, unknown> | undefined;
    const selected = typeof search?.player === 'string' ? search.player : null;
    const open = (player: string | null) => void navigate({ extension: 'minecraft', screen: 'players', params: { id }, search: player ? { player } : {} });

    const summary = useQuery({ queryKey: keys.overview(uuid), queryFn: () => overview(uuid), refetchInterval: 10_000, enabled: uuid !== '' });
    const list = useQuery({ queryKey: keys.players(uuid), queryFn: () => fetchPlayers(uuid), refetchInterval: 10_000, enabled: uuid !== '' });
    const online = (list.data ?? []).filter((player) => player.online).map((player) => player.name ?? '');
    const rcon = summary.data?.rcon ?? null;
    const onRcon = rcon && canManage && canEditFiles ? () => setRconOpen(true) : undefined;

    return (
        <ServerContentBlock title={selected ? 'View Player' : 'Player List'}>
            {selected ? (
                <>
                    <Button.Text type='button' size='small' onClick={() => open(null)} className='mc:mb-3'>
                        ← Player List
                    </Button.Text>
                    <PlayerDetail key={selected} uuid={selected} online={online} onTurnOnRcon={onRcon} />
                </>
            ) : (
                <div className='mc:flex mc:flex-col mc:gap-4'>
                    <ServerStats summary={summary.data} />
                    <TopBar running={summary.data?.running ?? false} rcon={rcon} onRcon={onRcon} />
                    {list.isPending ? (
                        <Spinner size='large' centered />
                    ) : list.isError ? (
                        <Alert type='danger'>{httpErrorToHuman(list.error)}</Alert>
                    ) : (
                        <PlayerList players={list.data} onView={(player) => open(player)} />
                    )}
                </div>
            )}
            {rcon && <RconDialog key={`rcon-${rconOpen}`} open={rconOpen} status={rcon} onClose={() => setRconOpen(false)} />}
        </ServerContentBlock>
    );
}

/** The plugin's header: who is online out of the maximum, the message of the day, the world. */
function ServerStats({ summary }: { summary: Overview | undefined }) {
    const motd = summary?.motd ? motdLines(summary.motd).map((runs) => runs.map((run) => run.text).join('')).join(' ').trim() : '';

    return (
        <div className='mc:grid mc:gap-3 mc:sm:grid-cols-3'>
            <Stat
                icon={Users}
                label='Online Players'
                value={summary ? (summary.running ? String(summary.online) : 'Offline') : '—'}
                limit={summary?.running && summary.max !== null ? `/ ${summary.max}` : undefined}
                unavailable={summary !== undefined && !summary.running}
            />
            <Stat icon={MessageSquareText} label='MOTD' value={<span className='mc:block mc:truncate' title={motd || undefined}>{motd || '—'}</span>} />
            <Stat icon={MapIcon} label='Map Name' value={summary?.world ?? '—'} />
        </div>
    );
}

function TopBar({ running, rcon, onRcon }: { running: boolean; rcon: RconStatus | null; onRcon?: () => void }) {
    const canManage = useServerPermission('ext.minecraft.manage');
    const [dialog, setDialog] = useState<'message' | 'add' | 'ips' | null>(null);

    if (!canManage) return null;

    return (
        <div className='mc:flex mc:flex-wrap mc:items-center mc:justify-end mc:gap-2'>
            <Button size='small' isSecondary disabled={!running} title={running ? undefined : 'The server is stopped.'} onClick={() => setDialog('message')}>
                Message all
            </Button>
            <Button size='small' isSecondary onClick={() => setDialog('add')}>
                Add by name
            </Button>
            <DropdownMenu
                triggerClassName='mc:inline-flex mc:size-8 mc:cursor-pointer mc:items-center mc:justify-center mc:rounded-md mc:border mc:border-border mc:bg-transparent mc:text-foreground mc:hover:bg-secondary'
                triggerContent={
                    <>
                        <MoreHorizontal aria-hidden className='mc:size-4' />
                        <span className='mc:sr-only'>More</span>
                    </>
                }
            >
                <DropdownMenuItem icon={Network} onClick={() => setDialog('ips')}>
                    Banned addresses…
                </DropdownMenuItem>
                {rcon && onRcon && (
                    <DropdownMenuItem icon={Zap} onClick={onRcon}>
                        {rcon.enabled ? 'RCON…' : 'Faster live data (RCON)…'}
                    </DropdownMenuItem>
                )}
            </DropdownMenu>
            <MessageAllDialog key={`message-${dialog === 'message'}`} open={dialog === 'message'} onClose={() => setDialog(null)} />
            <AddByNameDialog key={`add-${dialog === 'add'}`} open={dialog === 'add'} running={running} onClose={() => setDialog(null)} />
            <IpBansDialog open={dialog === 'ips'} onClose={() => setDialog(null)} />
        </div>
    );
}

function MessageAllDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const [text, setText] = useState('');
    const send = useMutation({
        mutationFn: () => broadcast(uuid, text.trim()),
        onSuccess: () => {
            toast.success('Sent to every player.');
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={open} onClose={onClose} title='Message every player'>
            <Label htmlFor='mc-broadcast'>Message</Label>
            <Input id='mc-broadcast' value={text} maxLength={256} placeholder='The server restarts in 5 minutes' onChange={(event) => setText(event.currentTarget.value)} />
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button isLoading={send.isPending} disabled={!text.trim()} onClick={() => send.mutate()}>
                    Send
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

/**
 * RCON lets the panel read an online player's inventory in one go and without writing in the
 * console. It needs a port of its own among the server's allocations.
 */
export function RconDialog({ open, status, onClose }: { open: boolean; status: RconStatus; onClose: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [port, setPort] = useState(String(status.ports.includes(status.port ?? 0) ? status.port : (status.ports[0] ?? '')));
    const [turnedOn, setTurnedOn] = useState(false);
    const enable = useMutation({
        mutationFn: () => enableRcon(uuid, Number(port)),
        onSuccess: () => {
            setTurnedOn(true);
            void client.invalidateQueries({ queryKey: keys.overview(uuid) });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
    const working = status.enabled && status.allocated;

    return (
        <Dialog open={open} onClose={onClose} title='Live data over RCON'>
            {turnedOn ? (
                <RestartNotice onRestarted={onClose}>RCON is on, on port {port}. It starts with the server's next start.</RestartNotice>
            ) : (
                <div className='mc:flex mc:flex-col mc:gap-4 mc:text-sm'>
                    <p className='mc:m-0'>
                        Without RCON the panel types its questions in the console and reads the answers back, which takes a few seconds and shows in the console. With RCON an online player&apos;s inventory and health come at once, silently.
                    </p>
                    {working && <Alert type='success'>RCON is on, on port {status.port}.</Alert>}
                    {status.enabled && !status.allocated && (
                        <Alert type='warning'>RCON is on, on port {status.port}, but that port is not one of this server&apos;s allocations, so the panel may not reach it. Choose an allocated port below.</Alert>
                    )}
                    {status.ports.length === 0 ? (
                        <Alert type='info'>RCON needs a port of its own. Add an allocation in the Network tab (or ask your host for one), then come back.</Alert>
                    ) : (
                        <div>
                            <Label htmlFor='mc-rcon-port'>Port</Label>
                            <Select id='mc-rcon-port' value={port} options={status.ports.map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => setPort(String(value))} />
                            <p className='mc:mt-1 mc:text-xs mc:text-muted-foreground'>The panel writes a new random password in server.properties. Nobody else needs it.</p>
                        </div>
                    )}
                </div>
            )}
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    {turnedOn ? 'Close' : 'Cancel'}
                </Button>
                {!turnedOn && status.ports.length > 0 && (
                    <Button isLoading={enable.isPending} disabled={port === ''} onClick={() => enable.mutate()}>
                        {working ? 'Use this port' : 'Turn on RCON'}
                    </Button>
                )}
            </Dialog.Footer>
        </Dialog>
    );
}

const LISTS: { value: ListName; label: string }[] = [
    { value: 'whitelist', label: 'The whitelist' },
    { value: 'ops', label: 'The operators' },
    { value: 'banned-players', label: 'The banned players' },
];

function AddByNameDialog({ open, running, onClose }: { open: boolean; running: boolean; onClose: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [name, setName] = useState('');
    const [list, setList] = useState<ListName>('whitelist');
    const [reason, setReason] = useState('');
    const valid = /^\.?[A-Za-z0-9_]{1,16}$/.test(name.trim());
    const add = useMutation({
        mutationFn: () => addByName(uuid, name.trim(), list, list === 'banned-players' ? reason.trim() : undefined),
        onSuccess: ({ message }) => {
            toast.success(message);
            window.setTimeout(() => void client.invalidateQueries({ queryKey: keys.players(uuid) }), running ? 1500 : 0);
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={open} onClose={onClose} title='Add a player by name'>
            <div className='mc:flex mc:flex-col mc:gap-4'>
                <div>
                    <Label htmlFor='mc-add-name'>Player name</Label>
                    <Input id='mc-add-name' value={name} maxLength={17} onChange={(event) => setName(event.currentTarget.value)} />
                    <p className='mc:mt-1 mc:text-xs mc:text-muted-foreground'>
                        {running ? 'The server is running: the console adds them at once.' : 'The server is stopped: their UUID comes from Mojang (or from the name in offline mode), and the file is changed.'}
                    </p>
                </div>
                <div>
                    <Label htmlFor='mc-add-list'>Add them to</Label>
                    <Select id='mc-add-list' value={list} options={LISTS} onChange={(value) => setList(value as ListName)} />
                </div>
                {list === 'banned-players' && (
                    <div>
                        <Label htmlFor='mc-add-reason'>Reason (optional)</Label>
                        <Input id='mc-add-reason' value={reason} maxLength={256} onChange={(event) => setReason(event.currentTarget.value)} />
                    </div>
                )}
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button isLoading={add.isPending} disabled={!valid} onClick={() => add.mutate()}>
                    Add
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function IpBansDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const query = useQuery({ queryKey: keys.ipBans(uuid), queryFn: () => ipBans(uuid), enabled: open });
    const [ip, setIp] = useState('');
    const [reason, setReason] = useState('');
    const change = useMutation({
        mutationFn: ({ address, add }: { address: string; add: boolean }) => changeIpBan(uuid, address, add, add ? reason.trim() : undefined),
        onSuccess: ({ message }, { add }) => {
            toast.success(message);
            if (add) setIp('');
            window.setTimeout(() => void client.invalidateQueries({ queryKey: keys.ipBans(uuid) }), 1500);
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={open} onClose={onClose} title='Banned addresses'>
            {query.isPending ? (
                <Spinner centered />
            ) : (
                <ul className='mc:m-0 mc:flex mc:max-h-64 mc:list-none mc:flex-col mc:gap-1 mc:overflow-y-auto mc:p-0'>
                    {(query.data ?? []).length === 0 && <li className='mc:text-sm mc:text-muted-foreground'>No address is banned.</li>}
                    {(query.data ?? []).map((ban) => (
                        <li key={ban.ip} className='mc:flex mc:items-center mc:gap-2 mc:rounded-sm mc:bg-sunken mc:px-3 mc:py-1.5'>
                            <code className='mc:text-sm'>{ban.ip}</code>
                            <span className='mc:min-w-0 mc:flex-1 mc:truncate mc:text-xs mc:text-muted-foreground'>{ban.reason}</span>
                            <DeleteAction aria-label={`Pardon ${ban.ip}`} label='Pardon' onClick={() => change.mutate({ address: ban.ip, add: false })} />
                        </li>
                    ))}
                </ul>
            )}
            <form
                className='mc:mt-4 mc:flex mc:flex-wrap mc:gap-2'
                onSubmit={(event) => {
                    event.preventDefault();
                    if (ip.trim()) change.mutate({ address: ip.trim(), add: true });
                }}
            >
                <Input aria-label='IP address' placeholder='IP address' value={ip} onChange={(event) => setIp(event.currentTarget.value)} className='mc:min-w-36 mc:flex-1' />
                <Input aria-label='Reason' placeholder='Reason (optional)' value={reason} maxLength={256} onChange={(event) => setReason(event.currentTarget.value)} className='mc:min-w-36 mc:flex-1' />
                <Button type='submit' isLoading={change.isPending} disabled={!ip.trim()}>
                    Ban
                </Button>
            </form>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Close
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
