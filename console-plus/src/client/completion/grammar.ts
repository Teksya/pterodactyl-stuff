/**
 * A game's console commands as a tree: literal words, and arguments with a kind the completion knows
 * values for (players, items, maps…). Minecraft's comes from its own command tree (minecraft.json);
 * the others are written as usage lines, `kick <player:player> [reason:text]`.
 */
export interface CommandNode {
    /** The literal word, or the argument's name. */
    n: string;
    /** The argument's kind; a literal word has none. */
    t?: string;
    /** The argument's values, when they are fixed. */
    v?: string[];
    c?: CommandNode[];
    /** Goes on with this command's arguments, as `execute as @a` goes on with `execute`'s; '' with any command. */
    r?: string;
    /** The command can be sent as it stands. */
    x?: 1;
    /** The first version it exists in, and the first it no longer does. */
    lo?: string | 0;
    hi?: string | 0;
    /** What the command does. */
    d?: string;
}

export type Version = number[];

/** `1.21.4`, `1.12.2-7.3.0` (Sponge), `1.20.1-47.2.0` (Forge), `26.1`; anything else (latest, a snapshot) is the newest. */
export function parseVersion(text: string | null | undefined): Version | null {
    const match = /(?:^|[^\d.])(\d+\.\d+(?:\.\d+)?)/.exec(` ${text ?? ''}`);

    return match ? match[1].split('.').map(Number) : null;
}

export function compareVersions(a: Version, b: Version): number {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0);
        if (difference !== 0) return difference;
    }

    return 0;
}

/** Whether something dated `lo` to `hi` exists in `version`; with no version, whether it still does. */
export function exists(version: Version | null, lo?: string | 0, hi?: string | 0): boolean {
    if (version === null) return !hi;
    if (lo && compareVersions(version, parseVersion(lo)!) < 0) return false;

    return !hi || compareVersions(version, parseVersion(hi)!) < 0;
}

/** The tree as it is in `version`. */
export function forVersion(nodes: CommandNode[], version: Version | null): CommandNode[] {
    return nodes
        .filter((node) => exists(version, node.lo, node.hi))
        .map((node) => (node.c ? { ...node, c: forVersion(node.c, version) } : node));
}

/** A command written as usage lines, with what it does and the versions what it adds exists in. */
export type Usage = string | [usage: string, description?: string, lo?: string, hi?: string];

/**
 * Builds a tree from usage lines: `word` a literal, `(a|b)` one of several literals, `<name:kind>` an
 * argument, `[name:kind]` an optional one (the command can be sent before it), `<name:a|b|c>` an
 * argument with those values, `...` any command after it (`execute … run …`). Lines of the same
 * command merge.
 */
export function commands(usages: Usage[]): CommandNode[] {
    const root: CommandNode = { n: '', c: [] };
    for (const usage of usages) {
        const [line, description, lo, hi] = typeof usage === 'string' ? [usage] : usage;
        let level: CommandNode[] = [root];
        // The versions date what the line adds to the commands before it: `title … actionbar`, not `title`.
        let dated = !lo && !hi;
        const parts = line.trim().split(/\s+/);
        parts.forEach((part, index) => {
            if (part === '...') {
                for (const parent of level) parent.r = '';
                return;
            }
            const optional = part.startsWith('[');
            const last = index === parts.length - 1;
            const next: CommandNode[] = [];
            const added: CommandNode[] = [];
            for (const parent of level) {
                if (optional) parent.x = 1;
                for (const node of parse(part)) {
                    const child = add(parent, node);
                    next.push(child);
                    if (child === node) added.push(node);
                }
            }
            if (index === 0 && description) for (const node of next) node.d ??= description;
            if (!dated && added.length > 0) {
                for (const node of added) {
                    if (lo) node.lo = lo;
                    if (hi) node.hi = hi;
                }
                dated = true;
            }
            if (last) for (const node of next) node.x = 1;
            level = next;
        });
    }

    return root.c!;
}

function parse(part: string): CommandNode[] {
    if (part.startsWith('<') || part.startsWith('[')) {
        const [name, kind = 'word'] = part.slice(1, -1).split(':');
        return [kind.includes('|') ? { n: name, t: 'word', v: kind.split('|') } : { n: name, t: kind }];
    }
    // (a|b), or within a word: weather.(rain|fog).
    const group = /^([^(]*)\(([^)]+)\)(.*)$/.exec(part);
    if (group) return group[2].split('|').map((word) => ({ n: group[1] + word + group[3] }));

    return [{ n: part }];
}

function add(parent: CommandNode, node: CommandNode): CommandNode {
    parent.c ??= [];
    const same = parent.c.find((child) => child.n === node.n && child.t === node.t);
    if (same) return same;
    parent.c.push(node);

    return node;
}
