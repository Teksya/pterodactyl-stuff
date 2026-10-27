import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { http } from '@pterodactyl/sdk/api';
import { SocketEvent } from '@pterodactyl/sdk';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import { parse, strip } from './ansi';
import { decorate, find } from './decorate';
import { countLevels, entries, levelOf, makeLine, matcher, mergeHistory } from './lines';
import { remember } from './preferences';
import ConsoleView from './ConsoleView';

let host: ExtensionTestHost | null = null;

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.restoreAllMocks();
});

test('reads ANSI colours and Minecraft codes', () => {
    expect(parse('\u001b[31mred\u001b[0m plain')).toEqual([{ text: 'red', fg: '#ef6b73' }, { text: ' plain' }]);
    expect(parse('\u001b[1;38;2;10;20;30mrgb')).toEqual([{ text: 'rgb', bold: true, fg: 'rgb(10, 20, 30)' }]);
    expect(parse('§aGreen §lbold§r end')).toEqual([
        { text: 'Green ', fg: '#55ff55' },
        { text: 'bold', fg: '#55ff55', bold: true },
        { text: ' end' },
    ]);
    expect(strip('\u001b[33m[12:00:00] §cHi\u001b[0m')).toBe('[12:00:00] Hi');
});

test('tells levels apart and folds traces and repeats', () => {
    expect(levelOf('[12:00:00] [Server thread/WARN]: Can\'t keep up!')).toBe('warn');
    expect(levelOf('[12:00:00] [Server thread/ERROR]: Encountered an unexpected exception')).toBe('error');
    expect(levelOf('java.lang.IllegalStateException: Boom')).toBe('error');
    expect(levelOf('[12:00:00] [Server thread/INFO]: Done (3.2s)!')).toBe('info');

    const lines = [
        '[INFO]: Starting',
        '[ERROR]: Ticking entity',
        '\tat net.minecraft.world.Level.tick(Level.java:10)',
        '\tat net.minecraft.server.Main.run(Main.java:42)',
        '[INFO]: tick',
        '[INFO]: tick',
        '[INFO]: tick',
    ].reduce<ReturnType<typeof makeLine>[]>((all, raw) => [...all, makeLine(raw, 'output', null, all.at(-1))], []);

    const shown = entries(lines, { level: 'all', traces: true, repeats: true }, []);
    expect(shown.map((entry) => [entry.line.text, entry.trace.length, entry.repeats])).toEqual([
        ['[INFO]: Starting', 0, 1],
        ['[ERROR]: Ticking entity', 2, 1],
        ['[INFO]: tick', 0, 3],
    ]);
    expect(lines[2].level).toBe('error');
    expect(countLevels(lines)).toEqual({ error: 1, warn: 0 });
    expect(entries(lines, { level: 'error', traces: true, repeats: true }, []).map((entry) => entry.line.text)).toEqual(['[ERROR]: Ticking entity']);
    expect(entries(lines, { level: 'all', traces: false, repeats: false }, [matcher('/^\\[INFO\\]: tick$/')]).length).toBe(4);
});

test('merges the history with the lines that came while it loaded', () => {
    const pending = [makeLine('b'), makeLine('c'), makeLine('d')];
    expect(mergeHistory(['a', 'b', 'c'], pending).map((line) => line.text)).toEqual(['a', 'b', 'c', 'd']);
    expect(mergeHistory(['a'], [makeLine('x')]).map((line) => line.text)).toEqual(['a', 'x']);
});

test('finds searches, links and server files', () => {
    expect(find('Error error ERROR', 'error').length).toBe(3);
    expect(find('player42 joined', '/player\\d+/')).toEqual([[0, 8]]);

    const text = 'See https://example.com/docs. and config/forge-common.toml or /home/container/logs/latest.log';
    const pieces = decorate([{ text }], text, 'docs', []);
    expect(pieces.find((piece) => piece.url)?.url).toBe('https://example.com/docs');
    expect(pieces.filter((piece) => piece.path).map((piece) => piece.path)).toEqual(['config/forge-common.toml', 'logs/latest.log']);
    expect(pieces.some((piece) => piece.search && piece.text === 'docs')).toBe(true);

    expect(remember(['a', 'b'], 'a')).toEqual(['b', 'a']);
});

function Harness({ submit = vi.fn() }: { submit?: () => void }) {
    const [value, setValue] = useState('');
    const model = {
        Terminal: () => null,
        loading: false,
        failed: false,
        retry: () => undefined,
        scrolledUp: false,
        scrollToBottom: () => undefined,
        command: { allowed: true, disabled: false, value, history: [], setValue, previous: () => undefined, next: () => undefined, submit },
    };

    return <ConsoleView {...({ model, Default: () => null } as unknown as Parameters<typeof ConsoleView>[0])} />;
}

test('shows live output with its level, filters and searches it', async () => {
    // The history request goes through the panel's generated client: unanswered here, the console starts empty.
    vi.spyOn(http, 'get').mockResolvedValue({ data: { data: {} } });
    vi.spyOn(http, 'put').mockResolvedValue({ data: {} });
    host = createExtensionTestHost({ server: createTestServer({ name: 'Survival' }), prefix: 'cx' });
    render(<Harness />, { wrapper: host.Wrapper });

    await waitFor(() => expect(screen.queryByRole('log')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 50));
    act(() => {
        host!.emitWebsocket(SocketEvent.CONSOLE_OUTPUT, '[12:00:00] [Server thread/INFO]: Starting minecraft server');
        host!.emitWebsocket(SocketEvent.CONSOLE_OUTPUT, '[12:00:01] [Server thread/WARN]: Can\'t keep up!');
        host!.emitWebsocket(SocketEvent.CONSOLE_OUTPUT, '\u001b[31m[12:00:02] [Server thread/ERROR]: Boom\u001b[0m');
        host!.emitWebsocket(SocketEvent.STATUS, 'running');
    });

    await screen.findByText(/Boom/);
    screen.getByText(/Server marked as running/);

    // The bar waits for Ctrl+F.
    expect(screen.queryByText('1 error')).toBeNull();
    fireEvent.keyDown(screen.getByRole('log'), { key: 'f', ctrlKey: true });
    screen.getByText('1 error');
    screen.getByText('1 warning');

    fireEvent.click(screen.getByText('1 error'));
    await waitFor(() => expect(screen.queryByText(/Can't keep up/)).toBeNull());
    screen.getByText(/Boom/);

    fireEvent.click(screen.getByText('1 error'));
    const field = screen.getByRole('textbox', { name: 'Search the console' });
    fireEvent.change(field, { target: { value: 'keep' } });
    await screen.findByText('1/1');

    // Escape clears the search, then closes the bar.
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search the console' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Search the console' })).toBeNull();
    screen.getByRole('button', { name: 'Open the toolbar' });
});

test("completes the game's commands in the command line, beside the history", { timeout: 15000 }, async () => {
    vi.spyOn(http, 'get').mockImplementation(async (url: string) => {
        if (url.endsWith('/game')) return { data: { data: { egg: 'Paper', tags: ['minecraft'], variables: { MINECRAFT_VERSION: '1.21.4' } } } };
        if (url.endsWith('/preferences')) return { data: { data: { history: ['list'] } } };

        return { data: { data: {} } };
    });
    vi.spyOn(http, 'put').mockResolvedValue({ data: {} });
    const submit = vi.fn();
    host = createExtensionTestHost({ server: createTestServer({ name: 'Survival', eggTags: ['minecraft'] }), prefix: 'cx' });
    render(<Harness submit={submit} />, { wrapper: host.Wrapper });

    const line = (await screen.findByRole('combobox', { name: 'Console command input.' })) as HTMLInputElement;
    await waitFor(() => expect(screen.queryByRole('log')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 50));
    act(() => host!.emitWebsocket(SocketEvent.CONSOLE_OUTPUT, '[12:00:05] [Server thread/INFO]: Steve joined the game'));
    await screen.findByText(/Steve joined the game/);

    // The arrows bring the history back while no suggestion shows.
    await waitFor(() => {
        fireEvent.keyDown(line, { key: 'ArrowUp' });
        expect(line.value).toBe('list');
    });
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.change(line, { target: { value: 'gamem' } });
    // The game's commands load once the API names the egg (Minecraft's are their own chunk).
    const options = () => screen.queryAllByRole('option').map((item) => item.firstChild?.textContent);
    await waitFor(() => expect(options()).toEqual(['gamemode']), { timeout: 5000 });
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
    screen.getByText('Minecraft 1.21.4');

    fireEvent.keyDown(line, { key: 'Tab' });
    await waitFor(() => expect(line.value).toBe('gamemode '));
    expect(options()).toEqual(['survival', 'creative', 'adventure', 'spectator']);
    // After a space nothing is picked: the arrows pick, Enter takes.
    fireEvent.keyDown(line, { key: 'ArrowDown' });
    fireEvent.keyDown(line, { key: 'ArrowDown' });
    fireEvent.keyDown(line, { key: 'Enter' });
    await waitFor(() => expect(line.value).toBe('gamemode creative '));
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(options()[0]).toBe('Steve'));

    fireEvent.change(line, { target: { value: 'gamemode creative St' } });
    fireEvent.keyDown(line, { key: 'Enter' });
    await waitFor(() => expect(line.value).toBe('gamemode creative Steve'));

    // Escape closes the suggestions, then Enter sends the line.
    fireEvent.change(line, { target: { value: 'gamemode creative Steve ' } });
    fireEvent.change(line, { target: { value: 'gamemode creative Stev' } });
    await screen.findByRole('listbox');
    fireEvent.keyDown(line, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(line, { key: 'Enter' });
    expect(submit).toHaveBeenCalledTimes(1);
});
