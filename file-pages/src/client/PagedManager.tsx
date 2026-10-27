import { useMemo, useState } from 'react';
import { usePanelNavigate, useServerPermission } from '@pterodactyl/sdk';
import type { FileManagerModel, ViewProps } from '@pterodactyl/sdk/theme';
import { buildEntries, filterEntries } from './entries';
import { PagingContext, pageWindow, readPageSize, writePageSize, type PageSize, type Paging } from './paging';

/** The view of one folder: what is selected, the page, the filter. Another folder starts afresh. */
interface FolderView {
    readonly directory: string;
    readonly selection: readonly string[];
    readonly page: number;
    readonly filter: string;
}

const freshView = (directory: string): FolderView => ({ directory, selection: [], page: 0, filter: '' });

/**
 * The file manager with every entry of the folder, where the panel keeps the first 250: its toolbar,
 * list and selection bar get one page of them, and selecting, opening and the actions work on any.
 */
export default function PagedManager({ model, Default, className }: ViewProps<'server.files.manager'>) {
    const navigate = usePanelNavigate();
    const canRead = useServerPermission('file.read');
    const canReadContent = useServerPermission('file.read-content');
    const [size, setSize] = useState<PageSize>(readPageSize);
    const [view, setView] = useState(() => freshView(model.directory));
    if (view.directory !== model.directory) setView(freshView(model.directory));

    const { slot, actions, directory } = model;
    const id = slot.server.attributes.identifier;
    const entries = useMemo(
        () => buildEntries(slot.files, { directory, id, canRead, canReadContent }),
        [slot.files, directory, id, canRead, canReadContent]
    );
    const matching = useMemo(() => filterEntries(entries, view.filter), [entries, view.filter]);
    const range = pageWindow(matching.length, size, view.page);
    const shown = useMemo(() => matching.slice(range.start, range.end), [matching, range.start, range.end]);

    // Names that left the folder (deleted, renamed, moved) leave the selection too.
    const names = useMemo(() => new Set(entries.map((entry) => entry.name)), [entries]);
    const selection = useMemo(() => view.selection.filter((name) => names.has(name)), [view.selection, names]);

    const patched = useMemo<FileManagerModel>(() => {
        const select = (picked: readonly string[]) =>
            setView((before) => ({ ...before, selection: [...new Set(picked)].filter((name) => names.has(name)) }));
        const deselect = (dropped: readonly string[]) =>
            setView((before) => ({ ...before, selection: before.selection.filter((name) => !dropped.includes(name)) }));

        return {
            ...model,
            entries: shown,
            truncated: false,
            selection,
            slot: { ...slot, selectedFiles: selection, setSelectedFiles: select },
            actions: {
                ...actions,
                select,
                // The panel opens only the entries it lists itself.
                open: async (name) => {
                    const entry = entries.find((candidate) => candidate.name === name);
                    if (!entry?.destination) throw new Error(`"${name}" cannot be opened.`);

                    await navigate(entry.destination);
                },
                // What clears or trims the panel's selection does the same to this one.
                rename: async (files) => {
                    await actions.rename(files);
                    select([]);
                },
                chmod: async (files) => {
                    await actions.chmod(files);
                    select([]);
                },
                remove: async (dropped) => {
                    await actions.remove(dropped);
                    deselect(dropped);
                },
                archive: async (dropped) => {
                    await actions.archive(dropped);
                    deselect(dropped);
                },
            },
        };
    }, [model, slot, actions, shown, selection, entries, names, navigate]);

    const paging = useMemo<Paging>(
        () => ({
            total: entries.length,
            matching: matching.length,
            ...range,
            size,
            filter: view.filter,
            // A new page, size or filter starts with nothing selected: the toolbar's checkbox counts the page.
            setPage: (page) => setView((before) => ({ ...before, selection: [], page })),
            setSize: (next) => {
                setSize(next);
                writePageSize(next);
                setView((before) => ({ ...before, selection: [], page: 0 }));
            },
            setFilter: (filter) => setView((before) => ({ ...before, selection: [], page: 0, filter })),
        }),
        [entries.length, matching.length, range.page, range.pages, range.start, range.end, size, view.filter]
    );

    return (
        <PagingContext.Provider value={paging}>
            <Default model={patched} className={className} />
        </PagingContext.Provider>
    );
}
