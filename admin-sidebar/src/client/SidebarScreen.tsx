import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpToLine, FolderInput, GripVertical, Pencil, Trash2 } from 'lucide-react';
import {
    Badge,
    Button,
    cn,
    Dialog,
    DropdownMenuItem,
    httpErrorToHuman,
    NavigationLabel,
    NewButton,
    PageContentBlock,
    PageHeading,
    RowActionsMenu,
    TitledGreyBox,
    toast,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { useNavigation, type NavItem } from '@pterodactyl/sdk/theme';
import { useLayout } from './api';
import FolderDialog from './FolderDialog';
import { addFolder, deleteFolder, folderOf, keyOf, moveFolder, moveItem, renameFolder, sections, type Folder } from './organize';

const DRAG_TYPE = 'application/x-admin-sidebar';

/** Accepts a dragged item: on a folder it goes at the end, on an item before it. */
function useDrop(onDrop: (key: string) => void) {
    const [over, setOver] = useState(false);

    return {
        over,
        handlers: {
            onDragOver: (event: React.DragEvent) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.stopPropagation();
                setOver(true);
            },
            onDragLeave: (event: React.DragEvent) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
            },
            onDrop: (event: React.DragEvent) => {
                const key = event.dataTransfer.getData(DRAG_TYPE);
                setOver(false);
                if (!key) return;
                event.preventDefault();
                event.stopPropagation();
                onDrop(key);
            },
        },
    };
}

function ItemRow({
    item,
    folders,
    folder,
    onMove,
    onDropBefore,
}: {
    item: NavItem;
    folders: Folder[];
    folder: string | null;
    onMove: (folder: string | null) => void;
    onDropBefore: (key: string) => void;
}) {
    const { over, handlers } = useDrop(onDropBefore);

    return (
        <div
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, keyOf(item));
                event.dataTransfer.effectAllowed = 'move';
            }}
            {...handlers}
            className={cn(
                'as:flex as:cursor-grab as:items-center as:gap-3 as:rounded-md as:border as:border-border as:bg-background/40 as:px-3 as:py-2 as:text-sm',
                over && 'as:outline-2 as:outline-offset-2 as:outline-primary'
            )}
        >
            <GripVertical className='as:size-4 as:shrink-0 as:text-muted-foreground' aria-hidden />
            <span className='as:min-w-0 as:flex-1'>
                <NavigationLabel label={item.label} icon={item.icon ?? 'puzzle'} />
            </span>
            {item.extensionId && (
                <Badge size='sm' variant='soft' tone='neutral'>
                    {item.extensionId}
                </Badge>
            )}
            <RowActionsMenu label={`Move ${item.label}`}>
                <DropdownMenuItem icon={ArrowUpToLine} checked={folder === null} onClick={() => onMove(null)}>
                    Top of the sidebar
                </DropdownMenuItem>
                {folders.map((option) => (
                    <DropdownMenuItem key={option.id} icon={FolderInput} checked={folder === option.id} onClick={() => onMove(option.id)}>
                        {option.name}
                    </DropdownMenuItem>
                ))}
            </RowActionsMenu>
        </div>
    );
}

function FolderBox({
    folder,
    title,
    first,
    last,
    children,
    onDrop,
    onRename,
    onDelete,
    onMoveFolder,
}: {
    folder: Folder | null;
    title: string;
    first: boolean;
    last: boolean;
    children: React.ReactNode;
    onDrop: (key: string) => void;
    onRename: () => void;
    onDelete: () => void;
    onMoveFolder: (by: -1 | 1) => void;
}) {
    const { over, handlers } = useDrop(onDrop);

    return (
        <div {...handlers} className={cn('as:rounded-sm', over && 'as:outline-2 as:outline-offset-4 as:outline-primary')}>
            <TitledGreyBox
                title={title}
                actions={
                    folder && (
                        <RowActionsMenu label={`Folder ${folder.name} actions`}>
                            <DropdownMenuItem icon={Pencil} onClick={onRename}>
                                Rename
                            </DropdownMenuItem>
                            {!first && (
                                <DropdownMenuItem icon={ArrowUp} onClick={() => onMoveFolder(-1)}>
                                    Move up
                                </DropdownMenuItem>
                            )}
                            {!last && (
                                <DropdownMenuItem icon={ArrowDown} onClick={() => onMoveFolder(1)}>
                                    Move down
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem icon={Trash2} danger onClick={onDelete}>
                                Delete
                            </DropdownMenuItem>
                        </RowActionsMenu>
                    )
                }
            >
                <div className='as:flex as:flex-col as:gap-2'>{children}</div>
            </TitledGreyBox>
        </div>
    );
}

/** Admin → Sidebar: the folders of the admin navigation and what is in each, for every administrator. */
export default function SidebarScreen(_props: ScreenComponentProps) {
    const items = useNavigation('admin').items;
    const { layout, update, reset } = useLayout();
    const [naming, setNaming] = useState<{ folder: Folder | null } | null>(null);
    const [removing, setRemoving] = useState<Folder | null>(null);
    const [resetting, setResetting] = useState(false);
    const all = sections(items, layout, { keepEmpty: true });
    const byKey = new Map(items.map((item) => [keyOf(item), item]));

    const move = (key: string, folder: string | null, before: NavItem | null) => {
        const item = byKey.get(key);
        if (item) update((current) => moveItem(current, items, item, folder, before));
    };

    return (
        <PageContentBlock title='Admin · Sidebar'>
            <PageHeading
                title='Sidebar'
                description='Arrange the admin navigation in folders, for every administrator. Pages that extensions add go to Extensions until you move them.'
                actions={
                    <div className='as:flex as:items-center as:gap-2'>
                        <Button isSecondary onClick={() => setResetting(true)}>
                            Reset
                        </Button>
                        <NewButton type='button' onClick={() => setNaming({ folder: null })}>
                            New folder
                        </NewButton>
                    </div>
                }
            />
            <div className='as:grid as:grid-cols-1 as:gap-6 as:lg:grid-cols-2'>
                {all.map((section, index) => (
                    <FolderBox
                        key={section.folder?.id ?? 'top'}
                        folder={section.folder}
                        title={section.folder?.name ?? 'Top of the sidebar'}
                        first={index <= 1}
                        last={index === all.length - 1}
                        onDrop={(key) => move(key, section.folder?.id ?? null, null)}
                        onRename={() => section.folder && setNaming({ folder: section.folder })}
                        onDelete={() => section.folder && setRemoving(section.folder)}
                        onMoveFolder={(by) => section.folder && update((current) => moveFolder(current, section.folder!.id, by))}
                    >
                        {section.items.length === 0 ? (
                            <p className='as:rounded-md as:border as:border-dashed as:border-border as:p-4 as:text-center as:text-sm as:text-muted-foreground'>
                                {section.folder ? 'Empty: it does not show in the sidebar. Drag pages here.' : 'Drag pages here to keep them above the folders.'}
                            </p>
                        ) : (
                            section.items.map((item) => (
                                <ItemRow
                                    key={keyOf(item)}
                                    item={item}
                                    folders={layout.folders}
                                    folder={folderOf(item, layout)}
                                    onMove={(folder) => move(keyOf(item), folder, null)}
                                    onDropBefore={(key) => key !== keyOf(item) && move(key, folderOf(item, layout), item)}
                                />
                            ))
                        )}
                    </FolderBox>
                ))}
            </div>
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
                <strong>{removing?.name}</strong> is removed; its pages go back where they were by default, or to the top.
            </Dialog.Confirm>
            <Dialog.Confirm
                open={resetting}
                onClose={() => setResetting(false)}
                title='Reset the sidebar'
                confirm='Reset'
                onConfirmed={() => {
                    reset().catch((error) => toast.error(httpErrorToHuman(error)));
                    setResetting(false);
                }}
            >
                The folders and the order go back to the defaults for every administrator.
            </Dialog.Confirm>
        </PageContentBlock>
    );
}
