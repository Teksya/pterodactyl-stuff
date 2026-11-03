import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, ScrollText } from 'lucide-react';
import {
    Badge,
    Button,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    RowActionButton,
    RowActions,
    Spinner,
    Table,
    fromNow,
    httpErrorToHuman,
    toast,
    type TableColumn,
} from '@pterodactyl/sdk';
import { getDeployment, keys, listDeployments, rollback, ROOT_KEY } from './api';
import { canRollback, duration, inProgress, shortSha, statusOf, TRIGGERS } from './present';
import type { Deployment } from './types';

/** A deploy's log, followed live while it runs. */
function LogDialog({ uuid, deployment, onClose }: { uuid: string; deployment: Deployment; onClose: () => void }) {
    const query = useQuery({
        queryKey: keys.deployment(uuid, deployment.id),
        queryFn: () => getDeployment(uuid, deployment.id),
        refetchInterval: (state) => (state.state.data && !inProgress(state.state.data) ? false : 2000),
    });
    const current = query.data ?? deployment;
    const status = statusOf(current.status);

    return (
        <Dialog open onClose={onClose} title={`Deploy ${shortSha(current.commit)}`} description={current.message ?? undefined}>
            <p className='gd:mb-2 gd:flex gd:items-center gd:gap-2 gd:text-sm'>
                <Badge size='sm' tone={status.tone}>
                    {status.label}
                </Badge>
                <span className='gd:text-muted-foreground'>
                    {TRIGGERS[current.trigger]}
                    {current.user ? ` by ${current.user}` : current.author ? ` from ${current.author}` : ''} · {fromNow(current.created_at)}
                    {duration(current.started_at, current.finished_at) ? ` · ${duration(current.started_at, current.finished_at)}` : ''}
                </span>
            </p>
            {query.isPending ? (
                <Spinner centered />
            ) : (
                <pre className='gd:max-h-96 gd:overflow-auto gd:whitespace-pre-wrap gd:break-all gd:rounded-md gd:bg-terminal gd:p-3 gd:font-mono gd:text-xs gd:leading-5 gd:text-terminal-foreground'>
                    {current.log || 'No log yet.'}
                    {inProgress(current) && '\n…'}
                </pre>
            )}
        </Dialog>
    );
}

/** Every deploy of the server, newest first, refreshed while one runs. */
export default function Deployments({ uuid, canDeploy }: { uuid: string; canDeploy: boolean }) {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<Deployment | null>(null);
    const [target, setTarget] = useState<Deployment | null>(null);
    const [busy, setBusy] = useState(false);
    const query = useQuery({
        queryKey: keys.deployments(uuid, page),
        queryFn: () => listDeployments(uuid, page),
        placeholderData: keepPreviousData,
        refetchInterval: (state) => (state.state.data?.data.some(inProgress) ? 3000 : false),
    });

    const columns = useMemo<TableColumn<Deployment>[]>(
        () => [
            {
                id: 'commit',
                label: 'Commit',
                cell: (deployment) => (
                    <div className='gd:min-w-0'>
                        <p className='gd:flex gd:items-center gd:gap-2'>
                            <code className='gd:font-mono gd:text-sm'>{shortSha(deployment.commit)}</code>
                            {deployment.current && (
                                <Badge size='sm' variant='soft' tone='success'>
                                    Live
                                </Badge>
                            )}
                        </p>
                        <p className='gd:max-w-md gd:truncate gd:text-xs gd:text-muted-foreground'>{deployment.message ?? deployment.branch}</p>
                    </div>
                ),
            },
            {
                id: 'status',
                label: 'Status',
                cell: (deployment) => {
                    const status = statusOf(deployment.status);

                    return (
                        <Badge size='sm' tone={status.tone}>
                            {status.label}
                        </Badge>
                    );
                },
            },
            {
                id: 'trigger',
                label: 'By',
                cell: (deployment) => (
                    <span className='gd:whitespace-nowrap gd:text-sm'>
                        {TRIGGERS[deployment.trigger]}
                        <span className='gd:text-muted-foreground'>{deployment.user ? ` · ${deployment.user}` : deployment.author ? ` · ${deployment.author}` : ''}</span>
                    </span>
                ),
                headerClassName: 'gd:hidden gd:md:table-cell',
                cellClassName: 'gd:hidden gd:md:table-cell',
            },
            {
                id: 'when',
                label: 'When',
                cell: (deployment) => (
                    <span className='gd:whitespace-nowrap gd:text-xs gd:text-muted-foreground'>
                        {fromNow(deployment.created_at)}
                        {duration(deployment.started_at, deployment.finished_at) ? ` · ${duration(deployment.started_at, deployment.finished_at)}` : ''}
                    </span>
                ),
                headerClassName: 'gd:hidden gd:lg:table-cell',
                cellClassName: 'gd:hidden gd:lg:table-cell',
            },
            {
                id: 'actions',
                label: <span className='gd:sr-only'>Actions</span>,
                cell: (deployment) => (
                    <RowActions>
                        <RowActionButton icon={ScrollText} label='Log' aria-label={`Log of ${shortSha(deployment.commit)}`} onClick={() => setOpen(deployment)} />
                        {canDeploy && canRollback(deployment) && (
                            <RowActionButton icon={RotateCcw} label='Roll back to this deploy' aria-label={`Roll back to ${shortSha(deployment.commit)}`} onClick={() => setTarget(deployment)} />
                        )}
                    </RowActions>
                ),
                headerClassName: 'gd:w-28 gd:text-right',
                cellClassName: 'gd:w-28 gd:text-right',
            },
        ],
        [canDeploy]
    );

    if (!query.data) return <Spinner size='large' centered />;

    return (
        <>
            <Table
                rows={query.data.data}
                columns={columns}
                keyOf={(deployment) => String(deployment.id)}
                emptyState={
                    <Empty size='compact'>
                        <EmptyHeader>
                            <EmptyMedia variant='icon'>
                                <History />
                            </EmptyMedia>
                            <EmptyTitle>No deploys yet</EmptyTitle>
                            <EmptyDescription>Deploy now, or push to the branch once the webhook is in place.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                }
            />
            {query.data.meta.pages > 1 && (
                <div className='gd:mt-3 gd:flex gd:items-center gd:justify-end gd:gap-2 gd:text-sm'>
                    <Button.Text size='small' disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        Newer
                    </Button.Text>
                    <span className='gd:text-muted-foreground'>
                        {page} / {query.data.meta.pages}
                    </span>
                    <Button.Text size='small' disabled={page >= query.data.meta.pages} onClick={() => setPage(page + 1)}>
                        Older
                    </Button.Text>
                </div>
            )}
            {open && <LogDialog key={open.id} uuid={uuid} deployment={open} onClose={() => setOpen(null)} />}
            <Dialog.Confirm
                open={target !== null}
                onClose={() => setTarget(null)}
                title='Roll back'
                confirm='Roll back'
                pending={busy}
                onConfirmed={async () => {
                    if (!target) return;
                    setBusy(true);
                    try {
                        await rollback(uuid, target.id);
                        await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
                        toast.success(`Rolling back to ${shortSha(target.commit)}.`);
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    }
                    setBusy(false);
                    setTarget(null);
                }}
            >
                The files of <strong>{shortSha(target?.commit ?? null)}</strong>
                {target?.message ? ` (${target.message})` : ''} go back in place; the current ones are kept as a release, so this can be undone the same way.
            </Dialog.Confirm>
        </>
    );
}
