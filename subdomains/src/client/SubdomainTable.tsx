import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Globe, RefreshCw } from 'lucide-react';
import {
    Badge,
    Button,
    CopyOnClick,
    DeleteAction,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    httpErrorToHuman,
    Label,
    RowActionButton,
    RowActions,
    Select,
    Spinner,
    Table,
    toast,
    Tooltip,
    type TableColumn,
} from '@pterodactyl/sdk';
import { deleteSubdomain, moveSubdomain, ROOT_KEY, syncSubdomain, type Context } from './api';
import { allocationLabel, stateOf } from './present';
import { allocationFromValue, allocationOptions, allocationValue } from './SubdomainForm';
import type { Allocation, Subdomain } from './types';

/** Points a subdomain at another of its server's allocations. */
function MoveDialog({ context, subdomain, allocations, onClose }: { context: Context; subdomain: Subdomain; allocations: Allocation[]; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [value, setValue] = useState<string | number>(allocationValue(subdomain.allocation_id));
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            const moved = await moveSubdomain(context, subdomain.id, allocationFromValue(value));
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(`${moved.host} now points at ${moved.address}.`);
            onClose();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onClose={() => !busy && onClose()} title={`Point ${subdomain.host} at`}>
            <Label htmlFor='sd-move'>Allocation</Label>
            <Select id='sd-move' value={value} options={allocationOptions(allocations)} onChange={setValue} />
            <p className='sd:mt-2 sd:text-xs sd:text-muted-foreground'>The primary allocation is followed when it changes.</p>
            <Dialog.Footer>
                <Button type='button' isSecondary onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type='button' isLoading={busy} onClick={() => void save()}>
                    Save
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

/** Subdomains with the address players use, what they point at, their state and actions. */
export default function SubdomainTable({
    subdomains,
    contextOf,
    canManage,
    allocations,
    showServer = false,
    emptyDescription,
}: {
    subdomains: Subdomain[] | undefined;
    contextOf: (subdomain: Subdomain) => Context;
    canManage: boolean;
    /** The server's allocations, to move a subdomain; none hides the action. */
    allocations?: Allocation[];
    showServer?: boolean;
    emptyDescription: string;
}) {
    const queryClient = useQueryClient();
    const [syncing, setSyncing] = useState<number | null>(null);
    const [moving, setMoving] = useState<Subdomain | null>(null);
    const [removing, setRemoving] = useState<Subdomain | null>(null);
    const [deleting, setDeleting] = useState(false);

    const columns = useMemo<TableColumn<Subdomain>[]>(() => {
        const sync = async (subdomain: Subdomain) => {
            setSyncing(subdomain.id);
            try {
                const result = await syncSubdomain(contextOf(subdomain), subdomain.id);
                if (result.status === 'active') toast.success(`${result.host}'s records are up to date.`);
                else toast.error(result.error ?? 'The records could not be updated.');
            } catch (error) {
                toast.error(httpErrorToHuman(error));
            } finally {
                setSyncing(null);
                await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            }
        };

        const pointsAt = (subdomain: Subdomain) => {
            const allocation = allocations?.find((item) => (subdomain.allocation_id === null ? item.primary : item.id === subdomain.allocation_id));
            if (allocation) return allocationLabel(allocation) + (subdomain.follows_primary ? ' · primary' : '');

            return subdomain.port !== null ? `Port ${subdomain.port}${subdomain.follows_primary ? ' · primary' : ''}` : '—';
        };

        return [
            {
                id: 'address',
                label: 'Address',
                sortValue: (subdomain) => subdomain.host,
                cell: (subdomain) => (
                    <div className='sd:min-w-0'>
                        <CopyOnClick text={subdomain.address}>
                            <span className='sd:truncate sd:font-mono sd:font-medium'>{subdomain.address}</span>
                        </CopyOnClick>
                        <p className='sd:mt-0.5 sd:flex sd:flex-wrap sd:gap-1'>
                            {subdomain.records.map((record) => (
                                <Tooltip key={record.name + record.type} content={record.name}>
                                    <span>
                                        <Badge size='sm' variant='soft' tone='neutral'>
                                            {record.type}
                                        </Badge>
                                    </span>
                                </Tooltip>
                            ))}
                        </p>
                    </div>
                ),
            },
            ...(showServer
                ? [
                      {
                          id: 'server',
                          label: 'Server',
                          sortValue: (subdomain: Subdomain) => subdomain.server?.name ?? '',
                          cell: (subdomain: Subdomain) => <span className='sd:truncate sd:text-sm'>{subdomain.server?.name ?? '—'}</span>,
                      } satisfies TableColumn<Subdomain>,
                  ]
                : []),
            {
                id: 'target',
                label: 'Points at',
                cell: (subdomain) => <span className='sd:whitespace-nowrap sd:font-mono sd:text-sm'>{pointsAt(subdomain)}</span>,
                headerClassName: 'sd:hidden sd:md:table-cell',
                cellClassName: 'sd:hidden sd:md:table-cell',
            },
            {
                id: 'state',
                label: 'State',
                cell: (subdomain) => {
                    const state = stateOf(subdomain);

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
                id: 'actions',
                label: <span className='sd:sr-only'>Actions</span>,
                cell: (subdomain) =>
                    canManage ? (
                        <RowActions>
                            <RowActionButton
                                icon={RefreshCw}
                                label='Update the records'
                                aria-label={`Update the records of ${subdomain.host}`}
                                disabled={syncing !== null}
                                disabledReason={syncing === subdomain.id ? 'Updating…' : undefined}
                                onClick={() => void sync(subdomain)}
                            />
                            {allocations && allocations.length > 1 && (
                                <RowActionButton icon={ArrowRightLeft} label='Change allocation' aria-label={`Change the allocation of ${subdomain.host}`} onClick={() => setMoving(subdomain)} />
                            )}
                            <DeleteAction aria-label={`Delete ${subdomain.host}`} onClick={() => setRemoving(subdomain)} />
                        </RowActions>
                    ) : null,
                headerClassName: 'sd:w-36 sd:text-right',
                cellClassName: 'sd:w-36 sd:text-right',
            },
        ];
    }, [allocations, canManage, contextOf, queryClient, showServer, syncing]);

    if (!subdomains) return <Spinner size='large' centered />;

    return (
        <>
            <Table
                rows={subdomains}
                columns={columns}
                keyOf={(subdomain) => String(subdomain.id)}
                emptyState={
                    <Empty size='compact'>
                        <EmptyHeader>
                            <EmptyMedia variant='icon'>
                                <Globe />
                            </EmptyMedia>
                            <EmptyTitle>No subdomains</EmptyTitle>
                            <EmptyDescription>{emptyDescription}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                }
            />
            {allocations && moving && <MoveDialog key={moving.id} context={contextOf(moving)} subdomain={moving} allocations={allocations} onClose={() => setMoving(null)} />}
            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title='Delete subdomain'
                confirm='Delete'
                pending={deleting}
                onConfirmed={async () => {
                    if (!removing) return;
                    setDeleting(true);
                    try {
                        await deleteSubdomain(contextOf(removing), removing.id);
                        await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
                        toast.success(`${removing.host} deleted.`);
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    }
                    setDeleting(false);
                    setRemoving(null);
                }}
            >
                <strong>{removing?.host}</strong> stops working once its DNS records expire, and anyone can take the name again.
            </Dialog.Confirm>
        </>
    );
}
