import type { SdkServer } from '@pterodactyl/sdk';

/** Whose servers the dashboard lists. `others` and `all` are for root administrators. */
export type Show = 'mine' | 'owned' | 'shared' | 'others' | 'all';
export type Group = 'folder' | 'node' | 'location' | 'egg' | 'ownership' | 'none';
export type Sort = 'name' | 'custom' | 'created';

export interface Folder {
    id: string;
    name: string;
    collapsed: boolean;
}

export interface Layout {
    /** In display order. */
    folders: Folder[];
    /** Server uuid → folder id; a server in none is unsorted. */
    placements: Record<string, string>;
    /** Server uuids in the order the user arranged them, for the custom sort. */
    order: string[];
    view: {
        show: Show;
        group: Group;
        sort: Sort;
        /** Keys of the groups (not folders) the user folded. */
        collapsed: string[];
    };
}

/** What the client API does not say about a server. */
export interface ServerMeta {
    uuid: string;
    node_id: number;
    node: string;
    location_id: number | null;
    location: string | null;
    location_description: string | null;
    egg_id: number | null;
    egg: string | null;
}

export interface Entry {
    server: SdkServer;
    meta: ServerMeta | undefined;
}

export type SectionKind = 'folder' | 'unsorted' | 'group';

export interface Section {
    key: string;
    kind: SectionKind;
    /** Null for the one section of an ungrouped list, drawn without a header. */
    title: string | null;
    description?: string | null;
    folder?: Folder;
    collapsed: boolean;
    entries: Entry[];
}
