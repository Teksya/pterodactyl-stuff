import { createContext, useContext } from 'react';

/** How many entries a page holds; `0` is every entry on one page. */
export const PAGE_SIZES = [50, 100, 250, 500, 1000, 0] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 100;

const sizeKey = 'file-pages.size';

export function readPageSize(): PageSize {
    try {
        const stored = localStorage.getItem(sizeKey);

        return PAGE_SIZES.find((size) => String(size) === stored) ?? DEFAULT_PAGE_SIZE;
    } catch {
        return DEFAULT_PAGE_SIZE;
    }
}

export function writePageSize(size: PageSize): void {
    try {
        localStorage.setItem(sizeKey, String(size));
    } catch {
        // Kept until the next page load.
    }
}

/** The page of `count` entries that `page` (from 0) shows, clamped to the last one. */
export function pageWindow(count: number, size: PageSize, page: number): { page: number; pages: number; start: number; end: number } {
    const perPage = size === 0 ? Math.max(count, 1) : size;
    const pages = Math.max(1, Math.ceil(count / perPage));
    const current = Math.min(Math.max(page, 0), pages - 1);
    const start = current * perPage;

    return { page: current, pages, start, end: Math.min(start + perPage, count) };
}

/** What the manager tells the list about the pages, from the whole folder. */
export interface Paging {
    /** Entries in the folder. */
    readonly total: number;
    /** Entries the filter keeps. */
    readonly matching: number;
    readonly page: number;
    readonly pages: number;
    readonly start: number;
    readonly end: number;
    readonly size: PageSize;
    readonly filter: string;
    readonly setPage: (page: number) => void;
    readonly setSize: (size: PageSize) => void;
    readonly setFilter: (filter: string) => void;
}

export const PagingContext = createContext<Paging | null>(null);

export const usePaging = () => useContext(PagingContext);
