import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Badge, cn, DropdownMenuItem, RowActionsMenu } from '@pterodactyl/sdk';
import { DRAG_TYPE } from './ServerRow';
import type { Section } from './types';

/**
 * A folder or a group: a header that folds it, and its servers. A folder (and the unsorted
 * servers, when there are folders) takes the servers dropped on it.
 */
export default function SectionView({
    section,
    first,
    last,
    editing,
    acceptsDrop,
    onToggle,
    onDrop,
    onRename,
    onDelete,
    onMoveFolder,
    children,
}: {
    section: Section;
    first: boolean;
    last: boolean;
    /** Shows the folder's menu and the place to drop servers in an empty one. */
    editing: boolean;
    acceptsDrop: boolean;
    onToggle: () => void;
    onDrop: (uuid: string) => void;
    onRename: () => void;
    onDelete: () => void;
    onMoveFolder: (by: -1 | 1) => void;
    children: ReactNode;
}) {
    const [over, setOver] = useState(false);
    const Chevron = section.collapsed ? ChevronRight : ChevronDown;
    const bodyId = `so-section-${section.key.replace(/[^a-z0-9-]/gi, '-')}`;

    const drop = {
        onDragOver: (event: React.DragEvent) => {
            if (!acceptsDrop || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
            event.preventDefault();
            setOver(true);
        },
        onDragLeave: (event: React.DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (event: React.DragEvent) => {
            const uuid = event.dataTransfer.getData(DRAG_TYPE);
            setOver(false);
            if (!acceptsDrop || !uuid) return;
            event.preventDefault();
            onDrop(uuid);
        },
    };

    return (
        <section aria-label={section.title ?? undefined} className={cn('so:rounded-sm', over && 'so:outline-2 so:outline-offset-4 so:outline-primary')} {...drop}>
            {section.title !== null && (
                <div className='so:mb-2 so:flex so:items-center so:gap-2'>
                    <button
                        type='button'
                        aria-expanded={!section.collapsed}
                        aria-controls={bodyId}
                        onClick={onToggle}
                        className='so:flex so:min-w-0 so:cursor-pointer so:items-center so:gap-2 so:border-0 so:bg-transparent so:p-0 so:text-left so:text-foreground'
                    >
                        <Chevron className='so:size-4 so:shrink-0 so:text-muted-foreground' aria-hidden />
                        <span className='so:truncate so:font-header so:text-sm so:font-semibold'>{section.title}</span>
                        {section.description && <span className='so:truncate so:text-xs so:text-muted-foreground'>{section.description}</span>}
                    </button>
                    <Badge size='sm' variant='soft' tone='neutral'>
                        {section.entries.length}
                    </Badge>
                    {editing && section.folder && (
                        <div className='so:ml-auto'>
                            <RowActionsMenu label={`Folder ${section.title} actions`}>
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
                        </div>
                    )}
                </div>
            )}
            {!section.collapsed && (section.entries.length > 0 || editing) && (
                <div id={bodyId} className='so:flex so:flex-col so:gap-2'>
                    {section.entries.length > 0 ? (
                        children
                    ) : (
                        <p className='so:rounded-sm so:border so:border-dashed so:border-border so:p-4 so:text-center so:text-sm so:text-muted-foreground'>
                            {acceptsDrop ? 'Drag servers here, or use a server’s menu.' : 'No servers.'}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
