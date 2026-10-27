import type { Value } from './complete';

/**
 * Players joining and leaving a game, as its console says it, each pattern capturing `name` (or its
 * first group) and, when the line has it, `id` (a Steam id, a UUID). `list` captures the answer naming
 * those online, `none` the answer saying no one is.
 */
export interface PlayerLines {
    join: RegExp[];
    leave?: RegExp[];
    list?: RegExp[];
    none?: RegExp[];
}

export interface Player {
    name: string;
    /** A Steam id or a UUID, when the console gave one. */
    id?: string;
    online: boolean;
}

/** A name the way the games write it in a list: "Steve (uuid)", " Alex". */
const clean = (name: string) => name.replace(/\s*\(.*\)$/, '').trim();

/**
 * The players the console has seen, those still online first, then the others, most recent first:
 * for kick, ban and every command that takes a player.
 */
export function seenPlayers(texts: string[], lines: PlayerLines): Player[] {
    const players = new Map<string, Player & { last: number }>();
    const see = (name: string, index: number, online: boolean, id?: string) => {
        const player = players.get(name) ?? { name, online, last: index };
        players.set(name, { ...player, online, last: index, id: id ?? player.id });
    };
    texts.forEach((text, index) => {
        const matches = (patterns: RegExp[] = []) => patterns.map((pattern) => pattern.exec(text)).filter((match) => match !== null);
        if (matches(lines.none).length > 0) for (const player of players.values()) player.online = false;
        for (const match of matches(lines.list)) {
            for (const player of players.values()) player.online = false;
            for (const name of match[1].split(/,\s*/).map(clean).filter(Boolean)) see(name, index, true);
        }
        for (const match of matches(lines.join)) see(clean(match.groups?.name ?? match[1]), index, true, match.groups?.id);
        for (const match of matches(lines.leave)) see(clean(match.groups?.name ?? match[1]), index, false, match.groups?.id);
    });
    const recent = [...players.values()].sort((a, b) => b.last - a.last);

    return [...recent.filter((player) => player.online), ...recent.filter((player) => !player.online)].map(({ name, id, online }) => (id ? { name, id, online } : { name, online }));
}

/** Players as names, saying who is online. */
export const playerNames = (players: Player[]): Value[] => players.map((player) => ({ value: player.name, detail: player.online ? 'online' : 'left' }));

/** Players as their ids, with their names: `76561198000000011  Notch (online)`. */
export const playerIds = (players: Player[]): Value[] =>
    players.filter((player) => player.id).map((player) => ({ value: player.id!, detail: `${player.name} (${player.online ? 'online' : 'left'})` }));

/** Every value the patterns capture in the console, the most recent first, once each. */
export function seenValues(texts: string[], patterns: RegExp[]): string[] {
    const found: string[] = [];
    for (let index = texts.length - 1; index >= 0; index--) {
        for (const pattern of patterns) {
            const value = pattern.exec(texts[index])?.[1];
            if (value && !found.includes(value)) found.push(value);
        }
    }

    return found;
}
