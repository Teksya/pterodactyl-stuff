import { parse, strip, type Segment } from './ansi';

export type Level = 'error' | 'warn' | 'info' | 'debug';
/** Where a line came from: the server's output, or what Wings and the panel say about it. */
export type Source = 'output' | 'daemon' | 'error';

export interface LogLine {
    id: number;
    raw: string;
    /** Without codes: what search, rules and download use. */
    text: string;
    segments: Segment[];
    level: Level;
    source: Source;
    /** When the console received it; history lines have none. */
    at: Date | null;
    /** A stack trace line or a "Caused by", which belongs to the line above. */
    continuation: boolean;
}

/** A line as shown: a stack trace folds under its first line, identical lines in a row fold into one. */
export interface Entry {
    line: LogLine;
    /** The trace lines folded under it. */
    trace: LogLine[];
    /** How many times it came in a row. */
    repeats: number;
}

// A logger marker, or a line that starts with an exception class (java.lang.IllegalStateException: ...).
const ERROR = /\b(?:ERROR|SEVERE|FATAL|CRITICAL)\b|^\s*[\w.$]*(?:Exception|Error)(?::|\s*$)/;
const WARN = /\b(?:WARN|WARNING)\b/;
const DEBUG = /\b(?:DEBUG|TRACE)\b/;
const CONTINUATION = /^\s+at\s|^\s*\.\.\.\s\d+\s(more|common frames omitted)|^Caused by:|^\s+Suppressed:/;

/**
 * The level a line states, by the usual logger markers ([Server thread/WARN], WARN:, ERROR...).
 * A stack trace line takes the level of the line it continues.
 */
export function levelOf(text: string): Level {
    if (ERROR.test(text)) return 'error';
    if (WARN.test(text)) return 'warn';
    if (DEBUG.test(text)) return 'debug';

    return 'info';
}

/** What the panel writes before its own messages, as its terminal does. */
export const PRELUDE = '\u001b[1m\u001b[33mcontainer@pterodactyl~ \u001b[0m';

let nextId = 1;

export function makeLine(raw: string, source: Source = 'output', at: Date | null = new Date(), previous?: LogLine): LogLine {
    const clean = raw.replace(/(?:\r\n|\r|\n)$/, '');
    const shown = source === 'daemon' ? PRELUDE + clean : source === 'error' ? `${PRELUDE}\u001b[1m\u001b[41m${clean}\u001b[0m` : clean;
    const text = strip(shown);
    const continuation = source === 'output' && CONTINUATION.test(strip(clean));

    return {
        id: nextId++,
        raw: shown,
        text,
        segments: parse(shown),
        level: source === 'error' ? 'error' : continuation && previous ? previous.level : levelOf(strip(clean)),
        source,
        at,
        continuation,
    };
}

/** Lines that arrived while the history loaded may be in it too: drop the ones it already ends with. */
export function mergeHistory(history: string[], pending: LogLine[]): LogLine[] {
    let overlap = Math.min(history.length, pending.length);
    while (overlap > 0) {
        const tail = history.slice(-overlap).map((line) => strip(line.replace(/(?:\r\n|\r|\n)$/, '')));
        if (tail.every((text, index) => text === pending[index].text)) break;
        overlap--;
    }
    const lines: LogLine[] = [];
    for (const raw of history) lines.push(makeLine(raw, 'output', null, lines.at(-1)));

    return [...lines, ...pending.slice(overlap)];
}

export interface Rules {
    /** Lines containing one of these, or matching one written /like this/, are hidden. */
    hide: string[];
    highlight: string[];
}

/** A rule as a test: /pattern/flags is a regular expression, anything else plain text in any case. */
export function matcher(rule: string): (text: string) => boolean {
    const regex = /^\/(.+)\/([a-z]*)$/.exec(rule.trim());
    if (regex) {
        try {
            const pattern = new RegExp(regex[1], regex[2].replace(/[gy]/g, ''));

            return (text) => pattern.test(text);
        } catch {
            // An invalid expression matches its text, like any other rule.
        }
    }
    const needle = rule.trim().toLowerCase();

    return (text) => needle !== '' && text.toLowerCase().includes(needle);
}

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface ViewOptions {
    level: 'all' | 'warn' | 'error';
    traces: boolean;
    repeats: boolean;
}

/** The entries to draw, in order: hidden lines dropped, the level filter applied, traces and repeats folded. */
export function entries(lines: LogLine[], options: ViewOptions, hide: ((text: string) => boolean)[]): Entry[] {
    const minimum = options.level === 'error' ? 3 : options.level === 'warn' ? 2 : 0;
    const out: Entry[] = [];

    for (const line of lines) {
        if (hide.some((test) => test(line.text))) continue;
        if (LEVEL_RANK[line.level] < minimum) continue;

        const last = out.at(-1);
        if (options.traces && line.continuation && last && last.line.source === 'output') {
            last.trace.push(line);
            continue;
        }
        if (options.repeats && last && last.trace.length === 0 && last.line.text === line.text) {
            last.repeats++;
            last.line = { ...line, id: last.line.id };
            continue;
        }
        out.push({ line, trace: [], repeats: 1 });
    }

    return out;
}

export interface Counts {
    error: number;
    warn: number;
}

export const countLevels = (lines: LogLine[]): Counts => ({
    error: lines.filter((line) => line.level === 'error' && !line.continuation).length,
    warn: lines.filter((line) => line.level === 'warn' && !line.continuation).length,
});

/** The lines as text, for the download. */
export const asText = (lines: LogLine[]): string =>
    lines.map((line) => (line.at ? `[${line.at.toLocaleTimeString()}] ` : '') + line.text).join('\n') + '\n';
