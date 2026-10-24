import type { Segment } from './ansi';

export interface Piece extends Segment {
    search?: boolean;
    highlight?: boolean;
    url?: string;
    /** A file of the server, relative to its root. */
    path?: string;
}

type Kind = 'search' | 'highlight' | 'url' | 'path';

interface Range {
    start: number;
    end: number;
    kind: Kind;
    value?: string;
}

const URL = /\bhttps?:\/\/[^\s<>"'`]+/g;
// Server files people look for in logs: under the usual folders, or the container's root.
const PATH =
    /(?:\/home\/container\/)?\b((?:config|logs|plugins|mods|world|crash-reports|kubejs|defaultconfigs|datapacks|scripts|cache)\/[\w./-]*[\w-]\.[a-z0-9]{1,8}|(?:server\.properties|eula\.txt|ops\.json|whitelist\.json|usercache\.json|latest\.log))\b/gi;

/** Every place a search or rule finds itself: /regex/flags, or plain text in any case. */
export function find(text: string, query: string): [number, number][] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const regex = /^\/(.+)\/([a-z]*)$/.exec(trimmed);
    let pattern: RegExp;
    try {
        pattern = regex ? new RegExp(regex[1], regex[2].replace(/[gy]/g, '') + 'g') : new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    } catch {
        pattern = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }
    const found: [number, number][] = [];
    for (const match of text.matchAll(pattern)) {
        // An empty match (/^/) marks nothing.
        if (match[0].length > 0) found.push([match.index, match.index + match[0].length]);
        if (found.length > 200) break;
    }

    return found;
}

function links(text: string): Range[] {
    const ranges: Range[] = [];
    for (const match of text.matchAll(URL)) {
        const value = match[0].replace(/[.,;:!?)\]}>]+$/, '');
        ranges.push({ start: match.index, end: match.index + value.length, kind: 'url', value });
    }
    for (const match of text.matchAll(PATH)) {
        const start = match.index;
        if (ranges.some((range) => range.kind === 'url' && start < range.end && start + match[0].length > range.start)) continue;
        ranges.push({ start, end: start + match[0].length, kind: 'path', value: match[1] });
    }

    return ranges;
}

/** Splits a line's styled runs where searches, highlights and links begin and end. */
export function decorate(segments: Segment[], text: string, search: string, highlights: string[]): Piece[] {
    const ranges: Range[] = [
        ...links(text),
        ...find(text, search).map(([start, end]): Range => ({ start, end, kind: 'search' })),
        ...highlights.flatMap((rule) => find(text, rule).map(([start, end]): Range => ({ start, end, kind: 'highlight' }))),
    ];
    if (ranges.length === 0) return segments;

    const cuts = new Set<number>();
    for (const range of ranges) {
        cuts.add(range.start);
        cuts.add(range.end);
    }

    const pieces: Piece[] = [];
    let offset = 0;
    for (const segment of segments) {
        const end = offset + segment.text.length;
        const points = [offset, ...[...cuts].filter((cut) => cut > offset && cut < end).sort((a, b) => a - b), end];
        for (let i = 0; i < points.length - 1; i++) {
            const [from, to] = [points[i], points[i + 1]];
            if (from === to) continue;
            const piece: Piece = { ...segment, text: text.slice(from, to) };
            for (const range of ranges) {
                if (range.start <= from && range.end >= to) {
                    if (range.kind === 'search') piece.search = true;
                    else if (range.kind === 'highlight') piece.highlight = true;
                    else if (range.kind === 'url') piece.url = range.value;
                    else piece.path = range.value;
                }
            }
            pieces.push(piece);
        }
        offset = end;
    }

    return pieces;
}
