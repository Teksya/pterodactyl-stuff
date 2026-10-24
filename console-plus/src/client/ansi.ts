/** A run of text with one style. Colours are CSS colours. */
export interface Segment {
    text: string;
    fg?: string;
    bg?: string;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
}

type Style = Omit<Segment, 'text'>;

/** The 16 terminal colours, readable on the dark console of every theme. */
const PALETTE = [
    '#3b4252', '#ef6b73', '#8bd49c', '#e8c46a', '#6aa6f8', '#c792ea', '#5fd4d8', '#d8dee9',
    '#6b7385', '#ff8a91', '#a7e8b5', '#f5d88a', '#8fbcff', '#dcb0f5', '#89e6e9', '#ffffff',
];

/** Minecraft's §0-§f, in the same order as its own colour table. */
const MINECRAFT: Record<string, string> = {
    '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa', '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
    '8': '#555555', '9': '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

function cube(n: number): string {
    if (n < 16) return PALETTE[n];
    if (n >= 232) {
        const level = 8 + (n - 232) * 10;

        return `rgb(${level}, ${level}, ${level})`;
    }
    const index = n - 16;
    const step = (value: number) => (value === 0 ? 0 : 55 + value * 40);

    return `rgb(${step(Math.floor(index / 36))}, ${step(Math.floor(index / 6) % 6)}, ${step(index % 6)})`;
}

function applySgr(style: Style, params: number[]): Style {
    const next = { ...style };
    for (let i = 0; i < params.length; i++) {
        const code = params[i];
        if (code === 0) {
            for (const key of Object.keys(next) as (keyof Style)[]) delete next[key];
        } else if (code === 1) next.bold = true;
        else if (code === 2) next.dim = true;
        else if (code === 3) next.italic = true;
        else if (code === 4) next.underline = true;
        else if (code === 9) next.strike = true;
        else if (code === 22) {
            delete next.bold;
            delete next.dim;
        } else if (code === 23) delete next.italic;
        else if (code === 24) delete next.underline;
        else if (code === 29) delete next.strike;
        else if (code >= 30 && code <= 37) next.fg = PALETTE[code - 30];
        else if (code >= 90 && code <= 97) next.fg = PALETTE[code - 90 + 8];
        else if (code === 39) delete next.fg;
        else if (code >= 40 && code <= 47) next.bg = PALETTE[code - 40];
        else if (code >= 100 && code <= 107) next.bg = PALETTE[code - 100 + 8];
        else if (code === 49) delete next.bg;
        else if (code === 38 || code === 48) {
            const key = code === 38 ? 'fg' : 'bg';
            if (params[i + 1] === 5 && params[i + 2] !== undefined) {
                next[key] = cube(params[i + 2]);
                i += 2;
            } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
                next[key] = `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`;
                i += 4;
            }
        }
    }

    return next;
}

function applyMinecraft(style: Style, code: string): Style {
    const lower = code.toLowerCase();
    if (MINECRAFT[lower]) return { fg: MINECRAFT[lower] };
    if (lower === 'r') return {};
    if (lower === 'l') return { ...style, bold: true };
    if (lower === 'o') return { ...style, italic: true };
    if (lower === 'n') return { ...style, underline: true };
    if (lower === 'm') return { ...style, strike: true };

    // §k (obfuscated) has no meaning outside the game.
    return style;
}

// eslint-disable-next-line no-control-regex
const TOKEN = /\u001b\[([0-9;?]*)([A-Za-z])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|§([0-9a-fk-or])/gi;

/** Splits a line into styled runs: ANSI SGR colours (16, 256 and true colour) and Minecraft § codes. */
export function parse(line: string): Segment[] {
    const segments: Segment[] = [];
    let style: Style = {};
    let last = 0;
    const push = (text: string) => {
        if (!text) return;
        const previous = segments.at(-1);
        // Runs of the same style merge, so a line is a few spans rather than one per code.
        if (previous && JSON.stringify({ ...previous, text: '' }) === JSON.stringify({ ...style, text: '' })) previous.text += text;
        else segments.push({ text, ...style });
    };

    for (const match of line.matchAll(TOKEN)) {
        push(line.slice(last, match.index));
        last = match.index + match[0].length;
        if (match[2] === 'm') {
            style = applySgr(style, (match[1] || '0').split(';').map((part) => Number(part) || 0));
        } else if (match[3]) {
            style = applyMinecraft(style, match[3]);
        }
        // Other escapes (cursor moves, titles) draw nothing.
    }
    push(line.slice(last));

    return segments;
}

/** The text without codes, for searching, filtering and download. */
export const strip = (line: string): string => line.replace(TOKEN, '');
