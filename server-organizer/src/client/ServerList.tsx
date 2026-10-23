import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Server as ServerIcon } from 'lucide-react';
import {
    Alert,
    Button,
    Dialog,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    httpErrorToHuman,
    Input,
    Label,
    ListToolbar,
    NewButton,
    NewLinkButton,
    PageHeading,
    Spinner,
    toast,
    useDebouncedCallback,
} from '@pterodactyl/sdk';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import { apiType, DEFAULT_LAYOUT, getLayout, LAYOUT_KEY, listServers, saveLayout, serversKey } from './api';
import { addFolder, buildSections, deleteFolder, filterByShow, moveFolder, placeServer, renameFolder, reorder, search, sortEntries, toggleSection } from './organize';
import ChoiceMenu from './ChoiceMenu';
import SectionView from './SectionView';
import ServerRow from './ServerRow';
import FolderDialog from './FolderDialog';
import type { Folder, Group, Layout, Section, Show, Sort } from './types';

const SHOW: { value: Show; label: string; admin?: boolean }[] = [
    { value: 'mine', label: 'My servers' },
    { value: 'owned', label: 'Owned by me' },
    { value: 'shared', label: 'Shared with me' },
    { value: 'others', label: 'Other users’ servers', admin: true },
    { value: 'all', label: 'Every server', admin: true },
];

const GROUP: { value: Group; label: string }[] = [
    { value: 'folder', label: 'Folders' },
    { value: 'node', label: 'Node' },
    { value: 'location', label: 'Location' },
    { value: 'egg', label: 'Egg' },
    { value: 'ownership', label: 'Owner' },
    { value: 'none', label: 'No grouping' },
];

const SORT: { value: Sort; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'created', label: 'Creation date' },
    { value: 'custom', label: 'My order' },
];

/**
 * The dashboard's server list, organised the user's way: in folders (dragged in, or moved from a
 * server's menu), or grouped by node, location, egg or owner; filtered to the servers they own,
 * those shared with them or, for administrators, everyone's; in their own order.
 */
export default function OrganizedServerList({ model, Default, className }: ViewProps<'dashboard.serverList'>) {
    const queryClient = useQueryClient();
    const layoutQuery = useQuery({ queryKey: LAYOUT_KEY, queryFn: getLayout, staleTime: Infinity });
    const layout = layoutQuery.data;
    const requested = layout?.view.show ?? 'mine';
    const show: Show = !model.canViewOthers && (requested === 'others' || requested === 'all') ? 'mine' : requested;
    const type = apiType(show);
    // The previous list stays while another kind of servers loads, so the toolbar never goes away.
    const list = useQuery({ queryKey: serversKey(type), queryFn: () => listServers(type), enabled: layout !== undefined, placeholderData: keepPreviousData });
    const [query, setQuery] = useState('');
    const [naming, setNaming] = useState<{ folder: Folder | null } | null>(null);
    const [removing, setRemoving] = useState<Folder | null>(null);
    // Menus, filters and dragging stay out of the way until the user asks to arrange the list.
    const [editing, setEditing] = useState(false);

    const save = useDebouncedCallback((next: Layout) => {
        saveLayout(next).catch((error) => toast.error(httpErrorToHuman(error)));
    }, 500);
    const update = (change: (current: Layout) => Layout) => {
        const next = change(queryClient.getQueryData<Layout>(LAYOUT_KEY) ?? DEFAULT_LAYOUT);
        queryClient.setQueryData(LAYOUT_KEY, next);
        save(next);
    };
    const setView = (view: Partial<Layout['view']>) => update((current) => ({ ...current, view: { ...current.view, ...view } }));

    const all = useMemo(
        () => (list.data ? filterByShow(list.data.servers.map((server) => ({ server, meta: list.data.meta.get(server.attributes.uuid) })), show) : []),
        [list.data, show]
    );
    const sorted = useMemo(() => (layout ? sortEntries(search(all, query), layout.view.sort, layout.order) : []), [all, query, layout]);
    const sections = useMemo(() => (layout ? buildSections(sorted, layout) : []), [sorted, layout]);

    // Without its own API (an error, an older panel), the dashboard stays the panel's.
    if (layoutQuery.isError || list.isError) return <Default />;

    if (!layout || !list.data) {
        return (
            <div className={className}>
                <Spinner centered size='large' />
            </div>
        );
    }

    if (list.data.truncated) {
        return (
            <div className={className}>
                <Alert type='info' className='so:mb-4'>
                    There are too many servers here to organise, so the panel’s own list shows them.
                    {show !== 'mine' && (
                        <Button.Text type='button' size='small' className='so:ml-2' onClick={() => setView({ show: 'mine' })}>
                            Show my servers
                        </Button.Text>
                    )}
                </Alert>
                <Default />
            </div>
        );
    }

    const arranged = sorted.map((entry) => entry.server.attributes.uuid);
    const grouping = layout.view.group;
    const folders = layout.folders;
    const folderSections = sections.filter((section) => section.kind === 'folder');

    const dropOn = (section: Section, uuid: string) => {
        if (section.kind === 'folder' && section.folder) update((current) => placeServer(current, uuid, section.folder!.id));
        else if (section.kind === 'unsorted') update((current) => placeServer(current, uuid, null));
    };
    const dropBefore = (uuid: string, before: string) =>
        update((current) => {
            const moved = reorder(current, arranged, uuid, before);

            // In folders, a server dropped among a folder's servers joins that folder.
            return grouping === 'folder' ? placeServer(moved, uuid, current.placements[before] ?? null) : moved;
        });

    const showOptions = SHOW.filter((option) => !option.admin || model.canViewOthers);

    return (
        <div className={className}>
            <PageHeading
                title='Servers'
                className='so:mb-4'
                actions={
                    <div className='so:flex so:items-center so:gap-2'>
                        {editing && grouping === 'folder' && (
                            <NewButton type='button' onClick={() => setNaming({ folder: null })}>
                                New folder
                            </NewButton>
                        )}
                        <Button type='button' isSecondary={!editing} aria-pressed={editing} onClick={() => setEditing(!editing)}>
                            <span className='so:inline-flex so:items-center so:gap-2'>
                                {editing ? <Check className='so:size-4' aria-hidden /> : <Pencil className='so:size-4' aria-hidden />}
                                {editing ? 'Done' : 'Arrange'}
                            </span>
                        </Button>
                    </div>
                }
            />
            <ListToolbar summary={`${all.length} server${all.length === 1 ? '' : 's'}`}>
                <div className='so:w-full so:sm:w-56'>
                    <Label htmlFor='so-search' className='so:sr-only'>
                        Search servers
                    </Label>
                    <Input id='so-search' placeholder='Search…' value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                {editing && (
                    <>
                        <ChoiceMenu label='Show' value={show} options={showOptions} onChange={(value) => setView({ show: value })} />
                        <ChoiceMenu label='Group' value={grouping} options={GROUP} onChange={(value) => setView({ group: value })} />
                        <ChoiceMenu label='Sort' value={layout.view.sort} options={SORT} onChange={(value) => setView({ sort: value })} />
                    </>
                )}
            </ListToolbar>
            <Slot name='dashboard.before' />
            {all.length === 0 ? (
                <Empty className='so:border so:bg-card'>
                    <EmptyHeader>
                        <EmptyMedia variant='icon'>
                            <ServerIcon />
                        </EmptyMedia>
                        <EmptyTitle>{show === 'others' ? 'No other servers' : 'No servers here'}</EmptyTitle>
                        <EmptyDescription>
                            {show === 'others'
                                ? 'There are no servers owned by other users.'
                                : show === 'shared'
                                  ? 'Servers other users invite you to will appear here.'
                                  : 'Servers you own or are invited to will appear here.'}
                        </EmptyDescription>
                    </EmptyHeader>
                    {model.canCreateServers && (
                        <EmptyContent>
                            <NewLinkButton to='/panel/servers/new'>New server</NewLinkButton>
                        </EmptyContent>
                    )}
                </Empty>
            ) : sorted.length === 0 ? (
                <p className='so:py-8 so:text-center so:text-sm so:text-muted-foreground'>No server matches “{query}”.</p>
            ) : (
                <div className='so:flex so:flex-col so:gap-6'>
                    {sections
                        // An empty "Other servers" only matters as a place to drop servers.
                        .filter((section) => editing || section.kind !== 'unsorted' || section.entries.length > 0)
                        .map((section) => (
                            <SectionView
                                key={section.key}
                                section={section}
                                first={section.folder !== undefined && folderSections[0]?.key === section.key}
                                last={section.folder !== undefined && folderSections.at(-1)?.key === section.key}
                                editing={editing}
                                acceptsDrop={editing && (section.kind === 'folder' || (section.kind === 'unsorted' && folders.length > 0))}
                                onToggle={() => update((current) => toggleSection(current, section.key, section.folder))}
                                onDrop={(uuid) => dropOn(section, uuid)}
                                onRename={() => section.folder && setNaming({ folder: section.folder })}
                                onDelete={() => section.folder && setRemoving(section.folder)}
                                onMoveFolder={(by) => section.folder && update((current) => moveFolder(current, section.folder!.id, by))}
                            >
                                {section.entries.map((entry) => (
                                    <ServerRow
                                        key={entry.server.attributes.uuid}
                                        entry={entry}
                                        folders={editing ? folders : []}
                                        folder={layout.placements[entry.server.attributes.uuid] ?? null}
                                        draggable={editing}
                                        onMove={(uuid, folder) => update((current) => placeServer(current, uuid, folder))}
                                        onDropBefore={dropBefore}
                                    />
                                ))}
                            </SectionView>
                        ))}
                </div>
            )}
            <Slot name='dashboard.after' />
            <FolderDialog
                open={naming !== null}
                initial={naming?.folder?.name ?? null}
                onClose={() => setNaming(null)}
                onSave={(name) => {
                    const folder = naming?.folder;
                    update((current) => (folder ? renameFolder(current, folder.id, name) : addFolder(current, name)));
                }}
            />
            <Dialog.Confirm
                open={removing !== null}
                onClose={() => setRemoving(null)}
                title='Delete folder'
                confirm='Delete'
                onConfirmed={() => {
                    if (removing) update((current) => deleteFolder(current, removing.id));
                    setRemoving(null);
                }}
            >
                <strong>{removing?.name}</strong> is removed; its servers go back with the others.
            </Dialog.Confirm>
        </div>
    );
}
