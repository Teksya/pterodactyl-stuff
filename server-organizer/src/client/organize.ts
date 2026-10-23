import type { Entry, Folder, Layout, Section, Show, Sort } from './types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** `owned` and `shared` split the user's own list; the others come from the API as asked. */
export function filterByShow(entries: Entry[], show: Show): Entry[] {
    if (show === 'owned') return entries.filter((entry) => entry.server.attributes.server_owner);
    if (show === 'shared') return entries.filter((entry) => !entry.server.attributes.server_owner);

    return entries;
}

/** Name, description, identifier, node, location or egg containing every word of the query. */
export function search(entries: Entry[], query: string): Entry[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return entries;

    return entries.filter(({ server: { attributes }, meta }) => {
        const text = [attributes.name, attributes.description, attributes.identifier, meta?.node ?? attributes.node, meta?.location, meta?.location_description, meta?.egg]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return words.every((word) => text.includes(word));
    });
}

export function sortEntries(entries: Entry[], sort: Sort, order: string[]): Entry[] {
    const byName = (a: Entry, b: Entry) => collator.compare(a.server.attributes.name, b.server.attributes.name);

    if (sort === 'created') {
        return [...entries].sort((a, b) => a.server.attributes.internal_id - b.server.attributes.internal_id);
    }

    if (sort === 'custom') {
        // Servers never arranged go after the arranged ones, by name.
        const position = new Map(order.map((uuid, index) => [uuid, index]));
        const rank = (entry: Entry) => position.get(entry.server.attributes.uuid) ?? Number.MAX_SAFE_INTEGER;

        return [...entries].sort((a, b) => rank(a) - rank(b) || byName(a, b));
    }

    return [...entries].sort(byName);
}

function grouped(entries: Entry[], keyOf: (entry: Entry) => string, titleOf: (entry: Entry) => [string, string | null], collapsed: string[]): Section[] {
    const sections = new Map<string, Section>();
    for (const entry of entries) {
        const key = keyOf(entry);
        let section = sections.get(key);
        if (!section) {
            const [title, description] = titleOf(entry);
            section = { key, kind: 'group', title, description, collapsed: collapsed.includes(key), entries: [] };
            sections.set(key, section);
        }
        section.entries.push(entry);
    }

    return [...sections.values()].sort((a, b) => collator.compare(a.title ?? '', b.title ?? ''));
}

/** The sections the dashboard draws, each with its entries in `entries`' order (already sorted). */
export function buildSections(entries: Entry[], layout: Layout): Section[] {
    const { group, collapsed, show } = layout.view;

    switch (group) {
        case 'folder': {
            const folders = new Map(layout.folders.map((folder) => [folder.id, folder]));
            const sections: Section[] = layout.folders.map((folder) => ({
                key: `folder:${folder.id}`,
                kind: 'folder',
                title: folder.name,
                folder,
                collapsed: folder.collapsed,
                entries: [],
            }));
            const unsorted: Section = {
                key: 'unsorted',
                kind: 'unsorted',
                title: layout.folders.length > 0 ? 'Other servers' : null,
                collapsed: layout.folders.length > 0 && collapsed.includes('unsorted'),
                entries: [],
            };
            const byKey = new Map(sections.map((section) => [section.key, section]));
            for (const entry of entries) {
                const folder = layout.placements[entry.server.attributes.uuid];
                (folder && folders.has(folder) ? byKey.get(`folder:${folder}`)! : unsorted).entries.push(entry);
            }

            return [...sections, unsorted];
        }
        case 'node':
            return grouped(entries, (entry) => `node:${entry.meta?.node_id ?? entry.server.attributes.node}`, (entry) => [entry.meta?.node ?? entry.server.attributes.node, entry.meta?.location ?? null], collapsed);
        case 'location':
            return grouped(
                entries,
                (entry) => `location:${entry.meta?.location_id ?? 'none'}`,
                (entry) => (entry.meta?.location ? [entry.meta.location, entry.meta.location_description] : ['No location', null]),
                collapsed
            );
        case 'egg':
            return grouped(entries, (entry) => `egg:${entry.meta?.egg_id ?? 'none'}`, (entry) => [entry.meta?.egg ?? 'Unknown egg', null], collapsed);
        case 'ownership': {
            const otherTitle = show === 'others' ? 'Other users’ servers' : show === 'all' ? 'Not yours' : 'Shared with you';
            const sections = grouped(
                entries,
                (entry) => (entry.server.attributes.server_owner ? 'ownership:owned' : 'ownership:other'),
                (entry) => [entry.server.attributes.server_owner ? 'Your servers' : otherTitle, null],
                collapsed
            );

            // Yours first, whatever the titles' order.
            const yours = (section: Section) => (section.key === 'ownership:owned' ? 0 : 1);

            return sections.sort((a, b) => yours(a) - yours(b));
        }
        default:
            return [{ key: 'all', kind: 'group', title: null, collapsed: false, entries }];
    }
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const addFolder = (layout: Layout, name: string): Layout => ({
    ...layout,
    folders: [...layout.folders, { id: newId(), name: name.trim(), collapsed: false }],
});

export const renameFolder = (layout: Layout, id: string, name: string): Layout => ({
    ...layout,
    folders: layout.folders.map((folder) => (folder.id === id ? { ...folder, name: name.trim() } : folder)),
});

/** Its servers go back with the unsorted ones. */
export const deleteFolder = (layout: Layout, id: string): Layout => ({
    ...layout,
    folders: layout.folders.filter((folder) => folder.id !== id),
    placements: Object.fromEntries(Object.entries(layout.placements).filter(([, folder]) => folder !== id)),
});

export function moveFolder(layout: Layout, id: string, by: -1 | 1): Layout {
    const folders = [...layout.folders];
    const from = folders.findIndex((folder) => folder.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= folders.length) return layout;
    [folders[from], folders[to]] = [folders[to], folders[from]];

    return { ...layout, folders };
}

/** Folds or unfolds a section: a folder keeps it on itself, a group in the view. */
export function toggleSection(layout: Layout, key: string, folder?: Folder): Layout {
    if (folder) {
        return { ...layout, folders: layout.folders.map((item) => (item.id === folder.id ? { ...item, collapsed: !item.collapsed } : item)) };
    }
    const collapsed = layout.view.collapsed.includes(key) ? layout.view.collapsed.filter((item) => item !== key) : [...layout.view.collapsed, key];

    return { ...layout, view: { ...layout.view, collapsed } };
}

/** Puts a server in a folder, or with the unsorted ones for null. */
export function placeServer(layout: Layout, uuid: string, folder: string | null): Layout {
    const placements = { ...layout.placements };
    if (folder) placements[uuid] = folder;
    else delete placements[uuid];

    return { ...layout, placements };
}

/**
 * Moves `uuid` before `before` (or to the end) in the custom order. `arranged` is every listed
 * server in its current order, so the servers never arranged keep where they were.
 */
export function reorder(layout: Layout, arranged: string[], uuid: string, before: string | null): Layout {
    const listed = new Set(arranged);
    const order = [...arranged, ...layout.order.filter((item) => !listed.has(item))].filter((item) => item !== uuid);
    const index = before === null ? -1 : order.indexOf(before);
    order.splice(index < 0 ? order.length : index, 0, uuid);

    return { ...layout, order, view: { ...layout.view, sort: 'custom' } };
}
