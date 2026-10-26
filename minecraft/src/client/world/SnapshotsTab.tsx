import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Camera, Download, History, Plus } from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    Checkbox,
    DeleteAction,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Input,
    Label,
    NumberInput,
    ProgressBar,
    RowActionButton,
    RowActions,
    Select,
    Spinner,
    Table,
    TitledGreyBox,
    actionsColumn,
    bytesToString,
    fromNow,
    httpErrorToHuman,
    toast,
    useCurrentServerUuid,
    useServerPermission,
    type TableColumn,
} from '@pterodactyl/sdk';
import { activateWorld, createWorld, deleteSnapshot, deleteWorld, fileUrl, keys, restoreSnapshot, saveSchedule, takeSnapshot, worlds as fetchWorlds } from '../api';
import RestartNotice from '../RestartNotice';
import type { Snapshot, WorldFolder, WorldsData } from '../types';
import { useSnapshotJob } from './useJob';

const INTERVALS = [
    { value: 0, label: 'Off' },
    { value: 1, label: 'Every hour' },
    { value: 3, label: 'Every 3 hours' },
    { value: 6, label: 'Every 6 hours' },
    { value: 12, label: 'Every 12 hours' },
    { value: 24, label: 'Every day' },
    { value: 48, label: 'Every 2 days' },
    { value: 168, label: 'Every week' },
];

const TYPES = [
    { value: '', label: 'Default' },
    { value: 'minecraft:flat', label: 'Superflat' },
    { value: 'minecraft:large_biomes', label: 'Large biomes' },
    { value: 'minecraft:amplified', label: 'Amplified' },
];

/** World → Worlds & snapshots: the worlds in the server's folder, and snapshots of them to go back to. */
export default function SnapshotsTab() {
    const uuid = useCurrentServerUuid() ?? '';
    const query = useQuery({ queryKey: keys.worlds(uuid), queryFn: () => fetchWorlds(uuid), enabled: uuid !== '' });
    const job = useSnapshotJob();
    const [switched, setSwitched] = useState(false);

    if (query.isPending) return <Spinner size='large' centered />;
    if (query.isError) return <Alert type='danger'>{httpErrorToHuman(query.error)}</Alert>;

    return (
        <div className='mc:flex mc:flex-col mc:gap-6'>
            {switched && <RestartNotice onRestarted={() => setSwitched(false)}>The server loads its world when it starts: restart it to play on the world you picked.</RestartNotice>}
            {job.running && (
                <div className='mc:rounded-md mc:border mc:border-border mc:bg-card mc:p-4' role='status'>
                    <div className='mc:mb-2 mc:flex mc:justify-between mc:gap-3 mc:text-sm'>
                        <span>{job.message}</span>
                        <span className='mc:tabular-nums mc:text-muted-foreground'>{job.percent}%</span>
                    </div>
                    <ProgressBar value={job.percent} label='Snapshot job' tone='accent' />
                </div>
            )}
            <WorldsCard data={query.data} busy={job.running} onSwitched={() => setSwitched(true)} onSnapshot={(folders, name) => takeSnapshot(uuid, name, folders).then(({ job: id }) => job.follow(id))} />
            <SnapshotsCard data={query.data} busy={job.running} onJob={job.follow} />
        </div>
    );
}

function WorldsCard({ data, busy, onSwitched, onSnapshot }: { data: WorldsData; busy: boolean; onSwitched: () => void; onSnapshot: (folders: string[], name: string) => Promise<void> }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const canManage = useServerPermission('ext.minecraft.worlds');
    const canDelete = useServerPermission(['ext.minecraft.worlds', 'file.delete']);
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState<WorldFolder | null>(null);
    const refresh = () => client.invalidateQueries({ queryKey: keys.worlds(uuid) });
    const run = useMutation({
        mutationFn: (work: () => Promise<{ message: string }>) => work(),
        onSuccess: ({ message }) => {
            toast.success(message);
            void refresh();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    const columns: TableColumn<WorldFolder>[] = [
        {
            id: 'name',
            label: 'World',
            sortValue: (world) => world.name.toLowerCase(),
            cell: (world) => (
                <div className='mc:min-w-0'>
                    <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-1.5'>
                        <span className='mc:font-medium'>{world.name}</span>
                        {world.active && (
                            <Badge size='sm' tone='success' variant='soft'>
                                Active
                            </Badge>
                        )}
                        {world.hardcore && (
                            <Badge size='sm' tone='danger' variant='soft'>
                                Hardcore
                            </Badge>
                        )}
                        {!world.found && (
                            <Badge size='sm' variant='soft'>
                                Created at the next start
                            </Badge>
                        )}
                    </div>
                    <code className='mc:text-xs mc:text-muted-foreground'>{world.folders.join(' · ') || world.folder}</code>
                </div>
            ),
        },
        { id: 'version', label: 'Version', cellClassName: 'mc:hidden mc:md:table-cell', headerClassName: 'mc:hidden mc:md:table-cell', cell: (world) => world.version ?? '—' },
        {
            id: 'played',
            label: 'Last played',
            sortValue: (world) => world.lastPlayed ?? '',
            cell: (world) => (world.lastPlayed ? <span title={new Date(world.lastPlayed).toLocaleString()}>{fromNow(world.lastPlayed)}</span> : '—'),
        },
        ...(canManage
            ? [
                  actionsColumn<WorldFolder>(3, (world) => (
                      <RowActions>
                          <RowActionButton icon={Camera} label='Take a snapshot' aria-label={`Snapshot ${world.name}`} disabled={busy || !world.found} onClick={() => void onSnapshot([world.folder], `${world.name}, ${new Date().toLocaleString()}`).catch((error) => toast.error(httpErrorToHuman(error)))} />
                          <RowActionButton icon={History} label='Load this world at the next start' aria-label={`Make ${world.name} active`} disabled={world.active || run.isPending} onClick={() => run.mutate(() => activateWorld(uuid, world.folder).then((result) => (onSwitched(), result)))} />
                          <DeleteAction aria-label={`Delete ${world.name}`} label={world.active ? 'The active world cannot be deleted' : canDelete ? 'Delete' : 'Deleting takes the permission to delete files'} disabled={world.active || !canDelete} onClick={() => setDeleting(world)} />
                      </RowActions>
                  )),
              ]
            : []),
    ];

    return (
        <TitledGreyBox
            title='Worlds'
            actions={
                canManage && (
                    <Button size='small' isSecondary onClick={() => setCreating(true)}>
                        <Plus aria-hidden className='mc:mr-1 mc:size-4' />
                        New world
                    </Button>
                )
            }
        >
            <Table rows={data.worlds} columns={columns} keyOf={(world) => world.folder} emptyState='The server creates its world the first time it starts.' />
            <CreateWorldDialog key={String(creating)} open={creating} onClose={() => setCreating(false)} onCreated={onSwitched} />
            <Dialog.Confirm
                open={deleting !== null}
                title={`Delete ${deleting?.name}?`}
                confirm='Delete'
                pending={run.isPending}
                onClose={() => setDeleting(null)}
                onConfirmed={() => deleting && run.mutate(() => deleteWorld(uuid, deleting.folder).finally(() => setDeleting(null)))}
            >
                The folders {deleting?.folders.join(', ')} are deleted for good. Take a snapshot first to be able to bring it back.
            </Dialog.Confirm>
        </TitledGreyBox>
    );
}

function CreateWorldDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [folder, setFolder] = useState('');
    const [seed, setSeed] = useState('');
    const [type, setType] = useState('');
    const valid = /^[A-Za-z0-9][A-Za-z0-9_\-. ]{0,63}$/.test(folder) && !folder.includes('..');
    const create = useMutation({
        mutationFn: () => createWorld(uuid, folder, seed.trim(), type),
        onSuccess: ({ message }) => {
            toast.success(message);
            void client.invalidateQueries({ queryKey: keys.worlds(uuid) });
            onCreated();
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={open} onClose={onClose} title='New world'>
            <div className='mc:flex mc:flex-col mc:gap-4'>
                <p className='mc:m-0 mc:text-sm mc:text-muted-foreground'>The server generates it at its next start and plays on it; the current world stays in its folder.</p>
                <div>
                    <Label htmlFor='mc-world-folder'>Folder</Label>
                    <Input id='mc-world-folder' value={folder} placeholder='survival-2' onChange={(event) => setFolder(event.currentTarget.value)} />
                </div>
                <div className='mc:grid mc:gap-3 mc:sm:grid-cols-2'>
                    <div>
                        <Label htmlFor='mc-world-seed'>Seed</Label>
                        <Input id='mc-world-seed' value={seed} placeholder='Random' onChange={(event) => setSeed(event.currentTarget.value)} />
                    </div>
                    <div>
                        <Label htmlFor='mc-world-type'>Type</Label>
                        <Select id='mc-world-type' value={type} options={TYPES} onChange={(value) => setType(String(value))} />
                    </div>
                </div>
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button isLoading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
                    Create
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function SnapshotsCard({ data, busy, onJob }: { data: WorldsData; busy: boolean; onJob: (job: string) => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const canManage = useServerPermission('ext.minecraft.worlds');
    // A restore stops the server and starts it again.
    const canRestore = useServerPermission(['ext.minecraft.worlds', 'control.stop', 'control.start']);
    const canDownload = useServerPermission('file.read');
    const [taking, setTaking] = useState(false);
    const [restoring, setRestoring] = useState<Snapshot | null>(null);
    const [deleting, setDeleting] = useState<Snapshot | null>(null);
    const manual = data.snapshots.filter((snapshot) => !snapshot.automatic).length;
    const full = manual >= data.limits.manual;

    const remove = useMutation({
        mutationFn: (snapshot: Snapshot) => deleteSnapshot(uuid, snapshot.uuid),
        onSuccess: ({ message }) => {
            toast.success(message);
            setDeleting(null);
            void client.invalidateQueries({ queryKey: keys.worlds(uuid) });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });
    const download = (snapshot: Snapshot) =>
        fileUrl(uuid, `/${snapshot.path}`).then(
            (url) => window.open(url, '_blank', 'noopener'),
            (error) => toast.error(httpErrorToHuman(error))
        );

    const columns: TableColumn<Snapshot>[] = [
        {
            id: 'name',
            label: 'Snapshot',
            sortValue: (snapshot) => snapshot.created_at,
            cell: (snapshot) => (
                <div className='mc:min-w-0'>
                    <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-1.5'>
                        <span className='mc:font-medium'>{snapshot.name}</span>
                        {snapshot.automatic && (
                            <Badge size='sm' variant='soft'>
                                Automatic
                            </Badge>
                        )}
                        {snapshot.missing && (
                            <Badge size='sm' tone='danger' variant='soft'>
                                Archive missing
                            </Badge>
                        )}
                    </div>
                    <span className='mc:text-xs mc:text-muted-foreground'>
                        <span title={new Date(snapshot.created_at).toLocaleString()}>{fromNow(snapshot.created_at)}</span> · {snapshot.worlds.join(', ')}
                        {snapshot.version && ` · ${snapshot.version}`}
                    </span>
                </div>
            ),
        },
        { id: 'size', label: 'Size', sortValue: (snapshot) => snapshot.size ?? 0, cell: (snapshot) => (snapshot.size !== null ? bytesToString(snapshot.size) : '—') },
        actionsColumn<Snapshot>(3, (snapshot) => (
            <RowActions>
                {canRestore && (
                    <RowActionButton icon={History} label='Restore' aria-label={`Restore ${snapshot.name}`} disabled={busy || snapshot.missing} onClick={() => setRestoring(snapshot)} />
                )}
                {canDownload && <RowActionButton icon={Download} label='Download' aria-label={`Download ${snapshot.name}`} disabled={snapshot.missing} onClick={() => void download(snapshot)} />}
                {canManage && <DeleteAction aria-label={`Delete ${snapshot.name}`} label='Delete' disabled={busy} onClick={() => setDeleting(snapshot)} />}
            </RowActions>
        )),
    ];

    return (
        <TitledGreyBox
            title='Snapshots'
            actions={
                canManage && (
                    <Button size='small' disabled={busy || full} title={full ? `This server keeps ${data.limits.manual} snapshots at most: delete one first.` : undefined} onClick={() => setTaking(true)}>
                        <Camera aria-hidden className='mc:mr-1.5 mc:size-4' />
                        Take a snapshot
                    </Button>
                )
            }
        >
            {data.snapshots.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <Archive />
                        </EmptyMedia>
                        <EmptyTitle>No snapshot yet</EmptyTitle>
                        <EmptyDescription>A snapshot keeps a copy of the world in the server's .snapshots folder, to bring it back in one click.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <Table rows={data.snapshots} columns={columns} keyOf={(snapshot) => snapshot.uuid} emptyState='' />
            )}
            <p className='mc:mt-3 mc:mb-0 mc:text-xs mc:text-muted-foreground'>
                {manual} of {data.limits.manual} snapshots taken by hand. They live in the server's .snapshots folder and count towards its disk space.
            </p>
            {canManage && <ScheduleForm data={data} />}

            <TakeDialog key={`take-${taking}`} open={taking} worlds={data.worlds} active={data.active} onClose={() => setTaking(false)} onJob={onJob} />
            <RestoreDialog key={`restore-${restoring?.uuid}`} snapshot={restoring} onClose={() => setRestoring(null)} onJob={onJob} />
            <Dialog.Confirm open={deleting !== null} title={`Delete ${deleting?.name}?`} confirm='Delete' pending={remove.isPending} onClose={() => setDeleting(null)} onConfirmed={() => deleting && remove.mutate(deleting)}>
                Its archive is deleted from the server for good.
            </Dialog.Confirm>
        </TitledGreyBox>
    );
}

function TakeDialog({ open, worlds, active, onClose, onJob }: { open: boolean; worlds: WorldFolder[]; active: string; onClose: () => void; onJob: (job: string) => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const [name, setName] = useState('');
    const [folder, setFolder] = useState(active);
    const take = useMutation({
        mutationFn: () => takeSnapshot(uuid, name.trim(), [folder]),
        onSuccess: ({ job }) => {
            onJob(job);
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={open} onClose={onClose} title='Take a snapshot'>
            <div className='mc:flex mc:flex-col mc:gap-4'>
                <div>
                    <Label htmlFor='mc-snapshot-name'>Name (optional)</Label>
                    <Input id='mc-snapshot-name' value={name} maxLength={100} placeholder='Before the update' onChange={(event) => setName(event.currentTarget.value)} />
                </div>
                <div>
                    <Label htmlFor='mc-snapshot-world'>World</Label>
                    <Select id='mc-snapshot-world' value={folder} options={worlds.filter((world) => world.found).map((world) => ({ value: world.folder, label: `${world.name}${world.active ? ' (active)' : ''}` }))} onChange={(value) => setFolder(String(value))} />
                </div>
                <p className='mc:m-0 mc:text-xs mc:text-muted-foreground'>The Nether and the End come along. A running server keeps running: autosaving pauses while the world is copied.</p>
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button isLoading={take.isPending} disabled={!folder} onClick={() => take.mutate()}>
                    Take it
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

function RestoreDialog({ snapshot, onClose, onJob }: { snapshot: Snapshot | null; onClose: () => void; onJob: (job: string) => void }) {
    const uuid = useCurrentServerUuid() ?? '';
    const [safety, setSafety] = useState(true);
    const restore = useMutation({
        mutationFn: () => restoreSnapshot(uuid, snapshot!.uuid, safety),
        onSuccess: ({ job }) => {
            onJob(job);
            onClose();
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <Dialog open={snapshot !== null} onClose={onClose} title={`Restore ${snapshot?.name}?`}>
            <div className='mc:flex mc:flex-col mc:gap-4 mc:text-sm'>
                <p className='mc:m-0'>
                    The server stops, <strong>{snapshot?.worlds.join(', ')}</strong> go back to how they were {snapshot && fromNow(snapshot.created_at)}, and the server starts again if it was running.
                </p>
                <label className='mc:flex mc:items-start mc:gap-2'>
                    <Checkbox checked={safety} onChange={setSafety} />
                    <span>
                        Keep a snapshot of the worlds as they are now
                        <span className='mc:block mc:text-xs mc:text-muted-foreground'>Recommended: it lets you undo the restore.</span>
                    </span>
                </label>
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button.Danger isLoading={restore.isPending} onClick={() => restore.mutate()}>
                    <History aria-hidden className='mc:mr-1.5 mc:size-4' />
                    Restore
                </Button.Danger>
            </Dialog.Footer>
        </Dialog>
    );
}

function ScheduleForm({ data }: { data: WorldsData }) {
    const uuid = useCurrentServerUuid() ?? '';
    const client = useQueryClient();
    const [interval, setInterval] = useState(data.schedule.interval_hours);
    const [keep, setKeep] = useState<number | null>(data.schedule.keep);
    const changed = interval !== data.schedule.interval_hours || keep !== data.schedule.keep;
    const save = useMutation({
        mutationFn: () => saveSchedule(uuid, interval, keep ?? 1),
        onSuccess: ({ message }) => {
            toast.success(message);
            void client.invalidateQueries({ queryKey: keys.worlds(uuid) });
        },
        onError: (error) => toast.error(httpErrorToHuman(error)),
    });

    return (
        <div className='mc:mt-4 mc:flex mc:flex-wrap mc:items-end mc:gap-3 mc:border-t mc:border-border mc:pt-4'>
            <div className='mc:w-44'>
                <Label htmlFor='mc-schedule'>Automatic snapshots</Label>
                <Select id='mc-schedule' value={interval} options={INTERVALS} onChange={(value) => setInterval(Number(value))} />
            </div>
            {interval > 0 && (
                <div className='mc:w-28'>
                    <Label htmlFor='mc-keep'>Keep the last</Label>
                    <NumberInput id='mc-keep' value={keep} min={1} max={data.limits.manual} onValueChange={setKeep} />
                </div>
            )}
            <Button size='small' isSecondary disabled={!changed || !keep} isLoading={save.isPending} onClick={() => save.mutate()}>
                Save
            </Button>
            {data.schedule.last_run_at && <span className='mc:text-xs mc:text-muted-foreground'>Last taken {fromNow(data.schedule.last_run_at)}</span>}
        </div>
    );
}
