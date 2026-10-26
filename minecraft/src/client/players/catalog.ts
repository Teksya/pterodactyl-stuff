import { useQuery } from '@tanstack/react-query';
import { settings } from '../settings';

export interface CatalogItem {
    name: string;
    displayName: string;
    stackSize: number;
}

const DATA = 'https://cdn.jsdelivr.net/gh/PrismarineJS/minecraft-data@master/data';

/** "Paper 1.21.4" or "1.20.1" as [1, 21, 4]. */
export function parseVersion(text: string | null | undefined): number[] | null {
    const match = text?.match(/(\d+)\.(\d+)(?:\.(\d+))?/);

    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

/** The newest version of minecraft-data's list that is not newer than the server's. */
export function closestVersion(available: string[], wanted: number[] | null): string | null {
    const parsed = available.map((name) => ({ name, version: parseVersion(name) })).filter((entry): entry is { name: string; version: number[] } => entry.version !== null);
    const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    parsed.sort((a, b) => compare(a.version, b.version));
    if (parsed.length === 0) return null;
    if (!wanted) return parsed[parsed.length - 1].name;

    return [...parsed].reverse().find((entry) => compare(entry.version, wanted) <= 0)?.name ?? parsed[0].name;
}

/**
 * Every item of the server's version, with its name and stack size, from minecraft-data. Only fetched
 * when the administrator allows outside requests; without it the picker takes typed ids.
 */
export function useItemCatalog(version: string | null | undefined) {
    return useQuery({
        queryKey: ['extensions', 'minecraft', 'catalog', version ?? 'latest'],
        enabled: settings.textures,
        staleTime: Infinity,
        retry: 1,
        queryFn: async (): Promise<CatalogItem[]> => {
            const paths = (await (await fetch(`${DATA}/dataPaths.json`)).json()) as { pc: Record<string, { items?: string }> };
            const chosen = closestVersion(Object.keys(paths.pc).filter((name) => paths.pc[name].items), parseVersion(version));
            if (!chosen) return [];

            const items = (await (await fetch(`${DATA}/${paths.pc[chosen].items}/items.json`)).json()) as CatalogItem[];

            return items.filter((item) => item.name !== 'air');
        },
    });
}
