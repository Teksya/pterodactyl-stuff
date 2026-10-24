import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk/api';
import { httpErrorToHuman, toast, useDebouncedCallback } from '@pterodactyl/sdk';

export interface Preferences {
    favourites: string[];
    /** Newest last. */
    history: string[];
    hide: string[];
    highlight: string[];
    view: {
        level: 'all' | 'warn' | 'error';
        timestamps: boolean;
        wrap: boolean;
        traces: boolean;
        repeats: boolean;
        size: 'sm' | 'md' | 'lg';
        /** The bar shows all the time, rather than on Ctrl+F. */
        toolbar: boolean;
        /** The time the graphs show. */
        range: '1m' | '5m' | '15m' | '1h';
        /** The panel's own cards and graphs, rather than this extension's. */
        original: boolean;
    };
}

export const DEFAULT_PREFERENCES: Preferences = {
    favourites: [],
    history: [],
    hide: [],
    highlight: [],
    view: { level: 'all', timestamps: false, wrap: true, traces: true, repeats: true, size: 'md', toolbar: false, range: '5m', original: false },
};

export const HISTORY_SIZE = 100;

const url = (server: string) => `/api/client/servers/${server}/extensions/console-plus/preferences`;
const key = (server: string) => ['console-plus', 'preferences', server] as const;

const normalize = (preferences: Partial<Preferences>): Preferences => ({
    ...DEFAULT_PREFERENCES,
    ...preferences,
    view: { ...DEFAULT_PREFERENCES.view, ...preferences.view },
});

/** The user's preferences for this server's console; changes show at once and save shortly after. */
export function usePreferences(server: string) {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: key(server),
        queryFn: async () => normalize((await http.get<{ data: Preferences }>(url(server))).data.data),
        staleTime: Infinity,
        retry: false,
    });
    const save = useDebouncedCallback((next: Preferences) => {
        http.put(url(server), next).catch((error) => toast.error(httpErrorToHuman(error)));
    }, 600);

    const update = (change: (current: Preferences) => Preferences) => {
        const next = change(queryClient.getQueryData<Preferences>(key(server)) ?? DEFAULT_PREFERENCES);
        queryClient.setQueryData(key(server), next);
        save(next);
    };

    // Without the extension's API (an error), the console still works with the defaults, unsaved.
    return { preferences: query.data ?? DEFAULT_PREFERENCES, loaded: query.isSuccess, update };
}

/** Adds a sent command to the history: once, newest last. */
export const remember = (history: string[], command: string): string[] =>
    [...history.filter((item) => item !== command), command].slice(-HISTORY_SIZE);
