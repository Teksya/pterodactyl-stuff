import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk/api';
import { httpErrorToHuman, toast, useDebouncedCallback } from '@pterodactyl/sdk';
import { DEFAULT_LAYOUT, type Layout } from './organize';

const URL = '/api/admin/extensions/admin-sidebar/layout';
export const LAYOUT_KEY = ['admin-sidebar', 'layout'] as const;

/** PHP sends an empty map as a list. */
const normalize = (layout: Layout | null): Layout =>
    layout ? { ...DEFAULT_LAYOUT, ...layout, placements: Array.isArray(layout.placements) ? {} : (layout.placements ?? {}) } : DEFAULT_LAYOUT;

/**
 * The arrangement of the admin navigation. Only root administrators reach the admin area, so the
 * query runs there only (`enabled`); elsewhere, and until it answers, the defaults apply.
 */
export function useLayout(enabled = true) {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: LAYOUT_KEY,
        queryFn: async () => normalize((await http.get<{ data: Layout | null }>(URL)).data.data),
        staleTime: Infinity,
        retry: false,
        enabled,
    });
    const save = useDebouncedCallback((next: Layout) => {
        http.put(URL, next).catch((error) => toast.error(httpErrorToHuman(error)));
    }, 500);

    const update = (change: (current: Layout) => Layout) => {
        const next = change(queryClient.getQueryData<Layout>(LAYOUT_KEY) ?? DEFAULT_LAYOUT);
        queryClient.setQueryData(LAYOUT_KEY, next);
        save(next);
    };

    const reset = async () => {
        save.cancel();
        await http.delete(URL);
        queryClient.setQueryData(LAYOUT_KEY, DEFAULT_LAYOUT);
    };

    return { layout: query.data ?? DEFAULT_LAYOUT, update, reset };
}
