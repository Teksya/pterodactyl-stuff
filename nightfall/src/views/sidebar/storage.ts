import { useState } from 'react';

/** A choice kept in the browser; without storage it lasts until the next page load. */
export function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

export function writeFlag(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, value ? '1' : '0');
    } catch {
        // Kept in memory only.
    }
}

/** Where the navigation goes: a sidebar beside the page, or a bar above it (on large screens). */
export type ShellLayout = 'sidebar' | 'topbar';

const layoutKey = 'nightfall.layout';

export function readLayout(): ShellLayout {
    try {
        return localStorage.getItem(layoutKey) === 'topbar' ? 'topbar' : 'sidebar';
    } catch {
        return 'sidebar';
    }
}

export function writeLayout(layout: ShellLayout): void {
    try {
        localStorage.setItem(layoutKey, layout);
    } catch {
        // Kept in memory only.
    }
}

/** A list of names kept in the browser, such as the folded groups, with a toggle for one name. */
export function useStoredList(key: string): [string[], (name: string) => void] {
    const [list, setList] = useState<string[]>(() => {
        try {
            const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

            return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
        } catch {
            return [];
        }
    });

    const toggle = (name: string) =>
        setList((current) => {
            const next = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // Kept in memory only.
            }

            return next;
        });

    return [list, toggle];
}
