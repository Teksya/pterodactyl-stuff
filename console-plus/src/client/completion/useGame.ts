import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk/api';
import { useCurrentServer } from '@pterodactyl/sdk';
import type { LogLine } from '../lines';
import type { Game } from './complete';
import { detect, loadGame, type GameInfo } from './games';
import { parseVersion, type Version } from './grammar';
import { VERSION_LINE } from './minecraft';

const url = (server: string) => `/api/client/servers/${server}/extensions/console-plus/game`;

/**
 * The commands of the server's game, for the command line to complete: picked by its egg (name,
 * tags, variables), in the version it runs. Minecraft's version is the one the server prints when it
 * starts, else its egg's variable, else the latest. Null for a game without console commands.
 */
export function useGame(server: string, lines: LogLine[]): Game | null {
    const current = useCurrentServer();
    const info = useQuery({
        queryKey: ['console-plus', 'game', server],
        queryFn: async () => (await http.get<{ data: GameInfo }>(url(server))).data.data,
        staleTime: Infinity,
        retry: false,
        enabled: server !== '',
    });
    // Without the extension's API, the egg's tags and the startup command still tell most games apart.
    const fetched = info.isSuccess || info.isError;
    const tags = current?.attributes.egg_tags;
    const invocation = current?.attributes.invocation;
    const detected = useMemo(
        () => (fetched ? detect({ tags, invocation, ...info.data }) : null),
        [fetched, info.data, tags, invocation]
    );

    const version = useRunningVersion(lines, detected?.game === 'minecraft');
    const texts = useRef<{ lines: LogLine[]; read: LogLine[] | null; texts: string[] }>({ lines, read: null, texts: [] });
    texts.current.lines = lines;

    const [game, setGame] = useState<Game | null>(null);
    useEffect(() => {
        if (!detected) {
            setGame(null);
            return;
        }
        let cancelled = false;
        // The console's text, read when a value is wanted and kept until the console changes.
        const read = () => {
            const holder = texts.current;
            if (holder.read !== holder.lines) {
                holder.read = holder.lines;
                holder.texts = holder.lines.map((line) => line.text);
            }

            return holder.texts;
        };
        loadGame(detected, version, read)
            .then((loaded) => !cancelled && setGame(loaded))
            .catch(() => !cancelled && setGame(null));

        return () => {
            cancelled = true;
        };
    }, [detected, version]);

    return game;
}

/** The version a Minecraft server said it runs when it started, while its console holds that line. */
function useRunningVersion(lines: LogLine[], enabled: boolean): Version | null {
    const [version, setVersion] = useState<string | null>(null);
    const scanned = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        // Only the lines that came since the last look.
        for (let index = lines.length - 1; index >= 0 && lines[index].id > scanned.current; index--) {
            const match = VERSION_LINE.exec(lines[index].text);
            if (match) {
                setVersion(match[1] ?? match[2]);
                break;
            }
        }
        scanned.current = lines.at(-1)?.id ?? scanned.current;
    }, [lines, enabled]);

    return useMemo(() => parseVersion(version), [version]);
}
