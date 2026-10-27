import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createTestFileManager, createTestFileManagerEntry, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type { FileManagerModel, ThemeDefinition } from '@pterodactyl/sdk/theme';
import { buildEntries, filterEntries, type FileObject } from './entries';
import PagedList from './PagedList';
import PagedManager from './PagedManager';
import { pageWindow } from './paging';

let rendered: RenderedView | undefined;

afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
    cleanup();
    localStorage.clear();
});

const layer = { views: { 'server.files.manager': PagedManager, 'server.files.manager.list': PagedList } } as unknown as ThemeDefinition;

const file = (name: string, kind: 'file' | 'directory' = 'file'): FileObject => createTestFileManagerEntry({ name, kind }).file;

/** A folder of `count` files (file-0001…) and two directories, as the panel lists it: its first 250 only. */
function bigFolder(count: number, selected: string[] = []): { model: FileManagerModel; picks: string[][] } {
    const files = [...Array.from({ length: count }, (_, index) => file(`file-${String(index + 1).padStart(4, '0')}.log`)), file('logs', 'directory'), file('backups', 'directory')];
    const picks: string[][] = [];
    const base = createTestFileManager({ entries: files.slice(0, 250).map((object) => createTestFileManagerEntry({ name: object.attributes.name })) });

    return {
        picks,
        model: {
            ...base,
            truncated: true,
            selection: selected,
            slot: { ...base.slot, files },
            actions: { ...base.actions, select: (names) => picks.push([...names]) },
        },
    };
}

/** The names of the rows shown, from their checkboxes (the toolbar's "Select all files" left out). */
const rows = () =>
    screen
        .getAllByRole('checkbox', { name: /^Select / })
        .map((box) => box.getAttribute('aria-label')!.replace('Select ', ''))
        .filter((name) => name !== 'all files');

test('builds every entry the panel would, directories first, each name once', () => {
    const entries = buildEntries([file('b.txt'), file('plugins', 'directory'), file('a.zip'), file('b.txt')], {
        directory: '/config',
        id: 'srv',
        canRead: true,
        canReadContent: true,
    });

    expect(entries.map((entry) => entry.name)).toEqual(['plugins', 'a.zip', 'b.txt']);
    expect(entries[0]).toMatchObject({ kind: 'directory', path: '/config/plugins', destination: { to: '/server/$id/files', hash: '/config/plugins' } });
    expect(entries[2]).toMatchObject({ kind: 'file', openable: true, destination: { to: '/server/$id/files/$action', params: { id: 'srv', action: 'edit' } } });

    // Without permission to read content, files stay closed; the root joins without a double slash.
    const closed = buildEntries([file('server.jar')], { directory: '/', id: 'srv', canRead: true, canReadContent: false });
    expect(closed[0]).toMatchObject({ path: '/server.jar', openable: false, destination: null });
    expect(filterEntries(entries, ' PLUG ').map((entry) => entry.name)).toEqual(['plugins']);
});

test('counts pages, the last one clamped, and all of them on one page', () => {
    expect(pageWindow(601, 100, 0)).toEqual({ page: 0, pages: 7, start: 0, end: 100 });
    expect(pageWindow(601, 100, 9)).toEqual({ page: 6, pages: 7, start: 600, end: 601 });
    expect(pageWindow(601, 0, 3)).toEqual({ page: 0, pages: 1, start: 0, end: 601 });
    expect(pageWindow(0, 50, 0)).toEqual({ page: 0, pages: 1, start: 0, end: 0 });
});

test('lists every file of a large folder in pages instead of the first 250', async () => {
    const { model } = bigFolder(600);
    rendered = renderView('server.files.manager', { themes: [layer], model, prefix: 'fp' });

    expect(screen.queryByText(/too large to display/)).toBeNull();
    await waitFor(() => expect(rows()).toHaveLength(100));
    expect(rows().slice(0, 3)).toEqual(['backups', 'logs', 'file-0001.log']);
    expect(screen.getAllByText('1–100 of 602')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Last page' })[0]);
    await waitFor(() => expect(rows()[rows().length - 1]).toBe('file-0600.log'));
    expect(screen.getAllByText('Page 7 of 7')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'First page' })[0]);
    expect(rows()[0]).toBe('backups');
});

test('shows every file on one page when the size kept in the browser is All', async () => {
    localStorage.setItem('file-pages.size', '0');
    rendered = renderView('server.files.manager', { themes: [layer], model: bigFolder(600).model, prefix: 'fp' });

    await waitFor(() => expect(rows()).toHaveLength(602));
    expect(screen.getByText('1–602 of 602')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
});

test('filters the whole folder by name, and says when nothing matches', async () => {
    const { model } = bigFolder(600);
    rendered = renderView('server.files.manager', { themes: [layer], model, prefix: 'fp' });

    fireEvent.change(await screen.findByRole('searchbox', { name: 'Filter this folder by name' }), { target: { value: 'FILE-059' } });
    await waitFor(() => expect(rows()).toEqual(Array.from({ length: 10 }, (_, index) => `file-059${index}.log`)));
    expect(screen.getByText('1–10 of 10 matching, 602 in the folder')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter this folder by name' }), { target: { value: 'nothing-here' } });
    expect(await screen.findByText('No files match')).toBeTruthy();
});

test('selects a file the panel would not list, and acts on it', async () => {
    const { model } = bigFolder(600);
    rendered = renderView('server.files.manager', { themes: [layer], model, prefix: 'fp' });

    fireEvent.click(await screen.findAllByRole('button', { name: 'Last page' }).then((buttons) => buttons[0]));
    const box = await screen.findByRole('checkbox', { name: 'Select file-0599.log' });
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select file-0599.log' }).getAttribute('aria-checked')).toBe('true'));

    // A new page starts with nothing selected.
    fireEvent.click(screen.getAllByRole('button', { name: 'Previous page' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Next page' })[0]);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select file-0599.log' }).getAttribute('aria-checked')).not.toBe('true'));
});

test('shows the filter and the count on a small folder, without page buttons', () => {
    rendered = renderView('server.files.manager', { themes: [layer], model: createTestFileManager(), prefix: 'fp' });

    expect(screen.getByRole('searchbox', { name: 'Filter this folder by name' })).toBeTruthy();
    expect(screen.getByText('1–2 of 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(within(rendered.container).getByRole('checkbox', { name: 'Select config.json' })).toBeTruthy();
});
