import { useCallback, useSyncExternalStore } from 'react';
import { SocketEvent, useServerWebsocketEvent } from '@pterodactyl/sdk';

/** One reading of the server, as Wings sends them (about every two seconds while it runs). */
export interface Sample {
    /** Epoch milliseconds. */
    t: number;
    /** Percent of one core. */
    cpu: number;
    /** Bytes. */
    memory: number;
    disk: number;
    /** Bytes received and sent since the server started. */
    rx: number;
    tx: number;
}

/** The longest range the graphs show; a little more is kept so the oldest point can slide out. */
export const KEEP_MS = 60 * 60 * 1000 + 30_000;

const SAVE_DELAY = 5_000;

interface Store {
    samples: Sample[];
    listeners: Set<() => void>;
    saveTimer: ReturnType<typeof setTimeout> | null;
}

const stores = new Map<string, Store>();
const storageKey = (server: string) => `console-plus:stats:${server}`;

function load(server: string): Sample[] {
    try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(server)) ?? '[]');
        if (!Array.isArray(saved)) return [];
        const since = Date.now() - KEEP_MS;

        return saved.filter((sample): sample is Sample => typeof sample?.t === 'number' && sample.t >= since);
    } catch {
        return [];
    }
}

function storeOf(server: string): Store {
    let store = stores.get(server);
    if (!store) {
        store = { samples: load(server), listeners: new Set(), saveTimer: null };
        stores.set(server, store);
    }

    return store;
}

/** Adds a reading; the same one arriving twice (both views listen) counts once. */
export function addSample(server: string, sample: Sample): void {
    const store = storeOf(server);
    const last = store.samples.at(-1);
    if (last && sample.t - last.t < 250) return;

    const since = sample.t - KEEP_MS;
    const start = store.samples.findIndex((item) => item.t >= since);
    store.samples = [...(start > 0 ? store.samples.slice(start) : start < 0 ? [] : store.samples), sample];
    for (const listener of store.listeners) listener();

    // The tab keeps its history across reloads, written every few seconds rather than on each reading.
    store.saveTimer ??= setTimeout(() => {
        store.saveTimer = null;
        try {
            sessionStorage.setItem(storageKey(server), JSON.stringify(store.samples));
        } catch {
            // Full or unavailable storage only costs the history after a reload.
        }
    }, SAVE_DELAY);
}

/** The readings kept for a server, oldest first. */
export const historyOf = (server: string): Sample[] => storeOf(server).samples;

/** Reads Wings' stats event; null for anything else. */
export function parseStats(data: string, t = Date.now()): Sample | null {
    try {
        const value = JSON.parse(data) as Record<string, unknown> & { network?: Record<string, unknown> };
        const numbers = [value.cpu_absolute, value.memory_bytes, value.disk_bytes, value.network?.rx_bytes, value.network?.tx_bytes];
        if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) return null;

        return {
            t,
            cpu: value.cpu_absolute as number,
            memory: value.memory_bytes as number,
            disk: value.disk_bytes as number,
            rx: value.network!.rx_bytes as number,
            tx: value.network!.tx_bytes as number,
        };
    } catch {
        return null;
    }
}

const empty: Sample[] = [];

/** The server's readings of the last hour, oldest first, kept while the tab is open. */
export function useStatsHistory(server: string): Sample[] {
    useServerWebsocketEvent(SocketEvent.STATS, (data) => {
        const sample = parseStats(data);
        if (sample && server) addSample(server, sample);
    });

    const subscribe = useCallback(
        (notify: () => void) => {
            const store = storeOf(server);
            store.listeners.add(notify);

            return () => store.listeners.delete(notify);
        },
        [server]
    );

    return useSyncExternalStore(subscribe, () => (server ? storeOf(server).samples : empty));
}

/**
 * Bytes per second received and sent between each reading and the one before; null for the first,
 * and 0 when the totals went back to zero (the server restarted).
 */
export function rates(samples: Sample[]): { rx: (number | null)[]; tx: (number | null)[] } {
    const rx: (number | null)[] = [];
    const tx: (number | null)[] = [];
    samples.forEach((sample, index) => {
        const previous = samples[index - 1];
        const seconds = previous ? (sample.t - previous.t) / 1000 : 0;
        // A gap (the tab slept, the server stopped) is not a rate.
        if (!previous || seconds <= 0 || seconds > 30) {
            rx.push(null);
            tx.push(null);

            return;
        }
        rx.push(Math.max(0, sample.rx - previous.rx) / seconds);
        tx.push(Math.max(0, sample.tx - previous.tx) / seconds);
    });

    return { rx, tx };
}

export interface Summary {
    current: number | null;
    average: number | null;
    peak: number | null;
}

export function summarize(values: (number | null)[]): Summary {
    const known = values.filter((value): value is number => value !== null);
    if (known.length === 0) return { current: null, average: null, peak: null };

    return {
        current: [...values].reverse().find((value) => value !== null) ?? null,
        average: known.reduce((total, value) => total + value, 0) / known.length,
        peak: Math.max(...known),
    };
}
