import type { NavItem } from '@pterodactyl/sdk/theme';

export interface Folder {
    id: string;
    name: string;
}

export interface Layout {
    /** In display order. */
    folders: Folder[];
    /** Item key → folder id, or "top" for above the folders. */
    placements: Record<string, string>;
    /** Item keys in the order the administrators arranged them. */
    order: string[];
}

/** A run of the navigation: the items above the folders (no folder), or one folder's. */
export interface Section {
    folder: Folder | null;
    items: NavItem[];
}

export const EXTENSIONS_FOLDER = 'extensions';

export const DEFAULT_LAYOUT: Layout = {
    folders: [
        { id: 'servers', name: 'Servers' },
        { id: 'users', name: 'Users' },
        { id: 'eggs', name: 'Eggs' },
        { id: 'panel', name: 'Panel' },
        { id: EXTENSIONS_FOLDER, name: 'Extensions' },
    ],
    placements: {},
    order: [],
};

/** Where the panel's own pages go until someone moves them; the rest of the core goes on top. */
const CORE_FOLDERS: Record<string, string> = {
    servers: 'servers',
    nodes: 'servers',
    locations: 'servers',
    databases: 'servers',
    mounts: 'servers',
    users: 'users',
    api: 'users',
    eggs: 'eggs',
    tags: 'eggs',
    settings: 'panel',
    themes: 'panel',
    extensions: 'panel',
};

const CORE_ORDER = ['index', 'activity', 'servers', 'nodes', 'locations', 'databases', 'mounts', 'users', 'api', 'eggs', 'tags', 'settings', 'themes', 'extensions'];

/** This extension's own page sits with the panel's settings. */
const OWN_KEY = 'ext:admin-sidebar:sidebar';

/** A stable name for an item: "core:<path>" for the panel's pages, "ext:<extension>:<screen>" for an extension's. */
export const keyOf = (item: NavItem): string => (item.extensionId ? `ext:${item.extensionId}:${item.id}` : `core:${item.id}`);

/** The folder an item is in: where it was put, else its default (extensions in Extensions), else on top. */
export function folderOf(item: NavItem, layout: Layout): string | null {
    const ids = new Set(layout.folders.map((folder) => folder.id));
    const key = keyOf(item);
    const placed = layout.placements[key];
    if (placed === 'top') return null;
    if (placed && ids.has(placed)) return placed;

    const fallback = key === OWN_KEY ? 'panel' : item.extensionId ? EXTENSIONS_FOLDER : CORE_FOLDERS[item.id];

    return fallback && ids.has(fallback) ? fallback : null;
}

/** Items in the order arranged, else the panel's pages in their usual order, then extensions' as listed. */
function sorted(items: NavItem[], layout: Layout, all: readonly NavItem[]): NavItem[] {
    const arranged = new Map(layout.order.map((key, index) => [key, index]));
    const rank = (item: NavItem) => {
        const position = arranged.get(keyOf(item));
        if (position !== undefined) return position;
        const core = item.extensionId ? -1 : CORE_ORDER.indexOf(item.id);

        return 10_000 + (core >= 0 ? core : 1_000 + all.indexOf(item));
    };

    return [...items].sort((a, b) => rank(a) - rank(b));
}

/** The navigation as sections: the items on top first, then each folder that has items, in order. */
export function sections(items: readonly NavItem[], layout: Layout, { keepEmpty = false } = {}): Section[] {
    const byFolder = new Map<string | null, NavItem[]>();
    for (const item of items) {
        const folder = folderOf(item, layout);
        byFolder.set(folder, [...(byFolder.get(folder) ?? []), item]);
    }
    const out: Section[] = [{ folder: null, items: sorted(byFolder.get(null) ?? [], layout, items) }];
    for (const folder of layout.folders) {
        const inside = byFolder.get(folder.id) ?? [];
        if (inside.length > 0 || keepEmpty) out.push({ folder, items: sorted(inside, layout, items) });
    }

    return out;
}

/** The items reordered and given their folder's name as `group`, which themes draw as a heading. */
export function organize(items: readonly NavItem[], layout: Layout): NavItem[] {
    return sections(items, layout).flatMap((section) => section.items.map((item) => ({ ...item, group: section.folder?.name ?? null })));
}

/** Moves an item into a folder (or on top, for null), before `before` or at the end of it. */
export function moveItem(layout: Layout, items: readonly NavItem[], item: NavItem, folder: string | null, before: NavItem | null): Layout {
    const key = keyOf(item);
    // The current order of everything, so items never arranged keep their place.
    const current = sections(items, layout, { keepEmpty: true }).flatMap((section) => section.items.map(keyOf));
    const order = current.filter((entry) => entry !== key);
    const index = before ? order.indexOf(keyOf(before)) : -1;
    if (index >= 0) order.splice(index, 0, key);
    else {
        // At the end of the folder: after its last item.
        const last = [...order].reverse().find((entry) => {
            const other = items.find((candidate) => keyOf(candidate) === entry);

            return other !== undefined && folderOf(other, layout) === folder;
        });
        order.splice(last ? order.indexOf(last) + 1 : order.length, 0, key);
    }

    return { ...layout, placements: { ...layout.placements, [key]: folder ?? 'top' }, order };
}

const newId = () => Math.random().toString(36).slice(2, 10);

export const addFolder = (layout: Layout, name: string): Layout => ({ ...layout, folders: [...layout.folders, { id: newId(), name: name.trim() }] });

export const renameFolder = (layout: Layout, id: string, name: string): Layout => ({
    ...layout,
    folders: layout.folders.map((folder) => (folder.id === id ? { ...folder, name: name.trim() } : folder)),
});

/** Its items go back to their defaults, or on top. */
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
