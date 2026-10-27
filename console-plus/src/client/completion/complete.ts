import type { CommandNode } from './grammar';

/** A value an argument can take, with what it is: a Steam id with its player's name. */
export type Value = string | { value: string; detail?: string };

/** A game's commands, and where the values of their arguments come from. */
export interface Game {
    /** Shown under the suggestions: "Minecraft 1.21.4". */
    name: string;
    commands: CommandNode[];
    /** The values an argument of this kind can take, such as the players seen in the console. */
    values?: (kind: string, node: CommandNode) => Value[] | undefined;
    /** Source and Rust take commands in any case. */
    ignoreCase?: boolean;
    /** Values with spaces go in quotes ("John Doe"). */
    quote?: boolean;
}

export interface Suggestion {
    /** What the list shows, and what goes in the line. */
    value: string;
    /** What goes in the line instead, when it is more than the value: `KickPlayer 7656…` for `kickplayer`. */
    insert?: string;
    /** What it is: a command's description, a player's name and whether they are online. */
    detail?: string;
    kind: 'command' | 'word' | 'value' | 'history';
    /** More is expected after it: accepting it adds a space. */
    more: boolean;
    /** The command a suggestion of a command is, to show its usage while it is picked. */
    node?: CommandNode;
}

/** A command's usage, `KickPlayer <SteamID>`: what is typed, the argument being typed, what follows. */
export interface Signature {
    parts: { text: string; role: 'done' | 'current' | 'next' }[];
    description?: string;
}

export interface Completion {
    /** The part of the line the suggestion replaces. */
    from: number;
    to: number;
    items: Suggestion[];
    /** The usage of the command being typed, once its name is. */
    signature: Signature | null;
}

const MAX = 50;
/** Arguments that take several words, and how many. */
const WIDTH: Record<string, number> = { xyz: 3, xz: 2 };
/** Arguments with a closed set of values: a word outside them is not this argument. */
const CLOSED = new Set(['bool', 'gamemode', 'color', 'anchor', 'operation', 'heightmap', 'mirror', 'turn']);

interface Token {
    text: string;
    start: number;
}

/**
 * Splits a command line into words, keeping a quoted string, a selector's `[…]` or NBT's `{…}` in
 * one word, as the games read them.
 */
export function tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    let start = -1;
    let depth = 0;
    let quote = false;
    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        if (start === -1) {
            if (character === ' ') continue;
            start = index;
        }
        if (quote) {
            if (character === '\\') index++;
            else if (character === '"') quote = false;
        } else if (character === '"') quote = true;
        else if (character === '[' || character === '{') depth++;
        else if ((character === ']' || character === '}') && depth > 0) depth--;
        else if (character === ' ' && depth === 0) {
            tokens.push({ text: line.slice(start, index), start });
            start = -1;
        }
    }
    if (start !== -1) tokens.push({ text: line.slice(start), start });

    return tokens;
}

/**
 * Where the parse stands, with the nodes read on the way: the nodes the next word can be, inside an
 * argument of several words, or in a free text that takes the rest of the line.
 */
type State =
    | { nodes: CommandNode[]; path: CommandNode[] }
    | { node: CommandNode; left: number; path: CommandNode[] }
    | { text: CommandNode; path: CommandNode[] };

const MAX_STATES = 64;

function after(node: CommandNode, root: CommandNode[]): CommandNode[] {
    const next = [...(node.c ?? [])];
    if (node.r === '') next.push(...root);
    else if (node.r !== undefined) next.push(...(root.find((command) => command.n === node.r)?.c ?? []));
    // Brigadier's way of leading back to every command (execute … run): no children, not complete.
    else if (next.length === 0 && !node.x) next.push(...root);

    return next;
}

function equal(a: string, b: string, ignoreCase: boolean) {
    return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function valuesOf(game: Game, node: CommandNode): { value: string; detail?: string }[] {
    const values: Value[] = node.t === 'command' ? game.commands.map((command) => ({ value: command.n, detail: command.d })) : (node.v ?? game.values?.(node.t!, node) ?? []);

    return values.map((value) => (typeof value === 'string' ? { value } : value));
}

function enter(node: CommandNode, path: CommandNode[], root: CommandNode[]): State {
    if (node.t === 'text') return { text: node, path };
    const width = WIDTH[node.t ?? ''] ?? 1;

    return width > 1 ? { node, left: width - 1, path } : { nodes: after(node, root), path: [...path, node] };
}

/** The states after one more word. */
function step(game: Game, states: State[], word: string): State[] {
    const next: State[] = [];
    const ignoreCase = !!game.ignoreCase;
    for (const state of states) {
        if ('text' in state) next.push(state);
        else if ('left' in state) {
            next.push(state.left > 1 ? { ...state, left: state.left - 1 } : { nodes: after(state.node, game.commands), path: [...state.path, state.node] });
        } else {
            const literals = state.nodes.filter((node) => !node.t && equal(node.n, word, ignoreCase));
            const matches = literals.length > 0
                ? literals
                : state.nodes.filter((node) => node.t && (!(node.v || CLOSED.has(node.t)) || valuesOf(game, node).some((item) => equal(item.value, word, true))));
            for (const node of matches) next.push(enter(node, state.path, game.commands));
        }
        if (next.length >= MAX_STATES) break;
    }

    return next;
}

function quoted(value: string, game: Game) {
    return game.quote && /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

const unique = (items: string[]) => [...new Set(items)];

/** How a set of nodes reads in a usage: `<SteamID>`, `[count]`, `(survival|creative|…)`, `uuids`. */
function label(nodes: CommandNode[], optional: boolean): string {
    const names = unique(nodes.filter((node) => node.t).map((node) => node.n));
    if (names.length > 0) return optional ? `[${names.join('|')}]` : `<${names.join('|')}>`;
    const words = unique(nodes.map((node) => node.n));
    const inner = (words.length > 4 ? [...words.slice(0, 4), '…'] : words).join('|');
    if (optional) return `[${inner}]`;

    return words.length > 1 ? `(${inner})` : inner;
}

/** What follows a node, along its first argument (or word) each time. */
function following(node: CommandNode): Signature['parts'] {
    const parts: Signature['parts'] = [];
    let current = node;
    while (parts.length < 6) {
        const children = current.c ?? [];
        if (children.length === 0) {
            if (current.r !== undefined || !current.x) parts.push({ text: '…', role: 'next' });
            break;
        }
        parts.push({ text: label(children, !!current.x), role: 'next' });
        current = children.find((child) => child.t) ?? children[0];
    }

    return parts;
}

const shown = (node: CommandNode) => (node.t ? `<${node.n}>` : node.n);

/** The usage of a command, its name first: for a command picked in the list. */
export function usage(node: CommandNode): Signature {
    return { parts: [{ text: node.n, role: 'current' }, ...following(node)], description: node.d };
}

/** The usage of the command a state is in, the argument it stands at marked. */
function signatureOf(state: State): Signature | null {
    if (state.path.length === 0 && !('left' in state)) return null;
    const done = state.path.map((node) => ({ text: shown(node), role: 'done' as const }));
    const description = (state.path[0] ?? ('left' in state ? state.node : undefined))?.d;
    if ('text' in state) return { parts: [...done, { text: shown(state.text), role: 'current' }], description };
    if ('left' in state) return { parts: [...done, { text: shown(state.node), role: 'current' }, ...following(state.node)], description };
    if (state.nodes.length === 0) return { parts: done, description };
    const chosen = state.nodes.find((node) => node.t) ?? state.nodes[0];
    const optional = !!state.path.at(-1)?.x;

    return { parts: [...done, { text: label(state.nodes, optional), role: 'current' }, ...following(chosen)], description };
}

/**
 * The suggestions for the word under the cursor of a command line, given the game's commands: the
 * commands that start with it, the next words of a command, the values of its arguments, and the
 * usage of the command being typed. A command typed whole that needs more (`kickplayer`) shows what
 * comes after it at once.
 */
export function complete(game: Game, line: string, cursor = line.length): Completion {
    const before = line.slice(0, cursor);
    // The games take a command with or without the chat's slash.
    const offset = /^\s*\//.test(before) ? before.indexOf('/') + 1 : 0;
    const tokens = tokenize(before.slice(offset));
    const typing = tokens.length > 0 && !/\s$/.test(before) ? tokens.pop()! : { text: '', start: before.length - offset };
    let end = cursor;
    while (end < line.length && line[end] !== ' ') end++;

    let states: State[] = [{ nodes: game.commands, path: [] }];
    for (const token of tokens) {
        states = step(game, states, token.text);
        if (states.length === 0) break;
    }

    const prefix = typing.text.replace(/^"/, '');
    const lower = prefix.toLowerCase();
    const first: Suggestion[] = [];
    const later: Suggestion[] = [];
    const seen = new Map<string, Suggestion>();
    const offer = (value: string, suggestion: Omit<Suggestion, 'value'>) => {
        const text = quoted(value, game);
        const known = seen.get(text.toLowerCase());
        if (known) {
            known.more ||= suggestion.more;
            return false;
        }
        const name = value.toLowerCase();
        const starts = name.startsWith(lower) || `minecraft:${name}`.startsWith(lower);
        // A value may also match by a later part of its name: "sword" finds diamond_sword.
        const inside = suggestion.kind === 'value' && lower.length >= 2 && ['_', '.', ':', '-'].some((separator) => name.includes(separator + lower));
        if (!starts && !inside) return false;
        const item = { value: text, ...suggestion };
        seen.set(text.toLowerCase(), item);
        (starts ? first : later).push(item);

        return true;
    };

    // The state the usage shows: the first that offers something, else the first.
    let shownState: State | undefined;
    for (const state of states) {
        let offered = false;
        if ('nodes' in state) {
            for (const node of state.nodes) {
                const more = !!node.c?.length || node.r !== undefined || !node.x;
                if (!node.t) {
                    const command = state.path.length === 0;
                    offered = offer(node.n, { kind: command ? 'command' : 'word', detail: node.d, more, node: command ? node : undefined }) || offered;
                    continue;
                }
                const width = WIDTH[node.t];
                if (width) {
                    if (!prefix || prefix === '~') offered = offer(Array(width).fill('~').join(' '), { kind: 'value', detail: 'Where you are', more }) || offered;
                    continue;
                }
                for (const item of valuesOf(game, node)) offered = offer(item.value, { kind: 'value', detail: item.detail, more }) || offered;
            }
        }
        if (offered && !shownState) shownState = state;
    }
    shownState ??= states[0];

    // Commands in alphabetical order; a command's own words and values in theirs.
    if (tokens.length === 0) first.sort((a, b) => a.value.localeCompare(b.value));
    const from = offset + typing.start;
    const items = [...first, ...later].slice(0, MAX);

    // A word typed whole that cannot be sent alone, and nothing longer: what comes after it.
    if (prefix && !/\s$/.test(before)) {
        const whole = states.flatMap((state) => ('nodes' in state ? state.nodes : [])).filter((node) => !node.t && node.n.toLowerCase() === lower);
        const others = items.filter((item) => item.value.toLowerCase() !== lower);
        if (whole.length === 1 && !whole[0].x && others.length === 0 && (game.ignoreCase || whole[0].n === prefix)) {
            const ahead = complete(game, `${before} `);
            if (ahead.items.length > 0 || ahead.signature) {
                return {
                    from,
                    to: end,
                    items: ahead.items.map((item) => ({ ...item, insert: `${whole[0].n} ${item.insert ?? item.value}` })),
                    signature: ahead.signature,
                };
            }
        }
    }

    return { from, to: end, items, signature: shownState ? signatureOf(shownState) : null };
}

/**
 * The completion of a line, with the commands sent before that start with it on top (at most three),
 * or null when there is nothing to offer. Without a game, only those.
 */
export function suggest(game: Game | null, line: string, history: string[], cursor = line.length): Completion | null {
    const completion: Completion = game ? complete(game, line, cursor) : { from: cursor, to: cursor, items: [], signature: null };
    const typed = line.trim().toLowerCase();
    const recent = typed
        ? [...history].reverse().filter((item) => item.toLowerCase().startsWith(typed) && item.toLowerCase() !== typed).slice(0, 3)
        : [];
    if (recent.length === 0 && completion.items.length === 0 && !completion.signature) return null;

    return {
        ...completion,
        items: [...recent.map((value): Suggestion => ({ value, kind: 'history', detail: 'Sent before', more: false })), ...completion.items],
    };
}

/** The line with a suggestion in place of the word it completes (a command sent before: the whole line), and where the cursor goes. */
export function accept(line: string, completion: Completion, suggestion: Suggestion): { line: string; cursor: number } {
    if (suggestion.kind === 'history') return { line: suggestion.value, cursor: suggestion.value.length };
    const rest = line.slice(completion.to);
    const space = suggestion.more && !rest.startsWith(' ') ? ' ' : '';
    const head = line.slice(0, completion.from) + (suggestion.insert ?? suggestion.value) + space;

    return { line: head + rest, cursor: head.length };
}
