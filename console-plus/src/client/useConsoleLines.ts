import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serverLogsQueryOptions, SocketEvent, useServerWebsocketEvent } from '@pterodactyl/sdk';
import { makeLine, mergeHistory, type LogLine, type Source } from './lines';

/** Kept in memory; older lines go. */
export const MAX_LINES = 5000;

const trim = (lines: LogLine[]) => (lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines);

/**
 * The server's console: the recent output Wings holds (the last 100 lines), then everything the
 * websocket sends, as the panel's own terminal shows it (power changes, daemon messages and
 * errors, install and transfer output). Lines are added once per frame, so a flood of output
 * renders as a few updates.
 */
export function useConsoleLines(server: string) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const queue = useRef<{ raw: string; source: Source; at: Date }[]>([]);
    const frame = useRef<number | null>(null);
    const history = useQuery({ ...serverLogsQueryOptions(server, 100), staleTime: Infinity, refetchOnWindowFocus: false });
    const ready = history.isSuccess || history.isError;
    const merged = useRef(false);

    const flush = useCallback(() => {
        frame.current = null;
        const items = queue.current;
        queue.current = [];
        setLines((current) => {
            const next = [...current];
            for (const item of items) next.push(makeLine(item.raw, item.source, item.at, next.at(-1)));

            return trim(next);
        });
    }, []);

    const add = useCallback(
        (raw: string, source: Source = 'output') => {
            queue.current.push({ raw, source, at: new Date() });
            // Until the history is in, lines wait so they land after it.
            if (merged.current && frame.current === null) frame.current = requestAnimationFrame(flush);
        },
        [flush]
    );

    useEffect(() => {
        if (!ready || merged.current) return;
        merged.current = true;
        const pending: LogLine[] = [];
        for (const item of queue.current) pending.push(makeLine(item.raw, item.source, item.at, pending.at(-1)));
        queue.current = [];
        setLines(trim(mergeHistory(history.data?.attributes.lines ?? [], pending)));
    }, [ready, history.data]);

    useEffect(() => () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
    }, []);

    useServerWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (line) => add(line));
    useServerWebsocketEvent(SocketEvent.INSTALL_OUTPUT, (line) => add(line));
    useServerWebsocketEvent(SocketEvent.TRANSFER_LOGS, (line) => add(line));
    useServerWebsocketEvent(SocketEvent.DAEMON_MESSAGE, (line) => add(line, 'daemon'));
    useServerWebsocketEvent(SocketEvent.DAEMON_ERROR, (line) => add(line, 'error'));
    useServerWebsocketEvent(SocketEvent.STATUS, (state) => add(`Server marked as ${state}...`, 'daemon'));

    return { lines, loading: !ready, clear: useCallback(() => setLines([]), []) };
}
