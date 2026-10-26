import type { CSSProperties, ReactNode } from 'react';

/** The 16 colours of § codes, as the game draws them. */
export const COLOURS: Record<string, { name: string; hex: string }> = {
    '0': { name: 'Black', hex: '#000000' },
    '1': { name: 'Dark blue', hex: '#0000AA' },
    '2': { name: 'Dark green', hex: '#00AA00' },
    '3': { name: 'Dark aqua', hex: '#00AAAA' },
    '4': { name: 'Dark red', hex: '#AA0000' },
    '5': { name: 'Dark purple', hex: '#AA00AA' },
    '6': { name: 'Gold', hex: '#FFAA00' },
    '7': { name: 'Grey', hex: '#AAAAAA' },
    '8': { name: 'Dark grey', hex: '#555555' },
    '9': { name: 'Blue', hex: '#5555FF' },
    a: { name: 'Green', hex: '#55FF55' },
    b: { name: 'Aqua', hex: '#55FFFF' },
    c: { name: 'Red', hex: '#FF5555' },
    d: { name: 'Light purple', hex: '#FF55FF' },
    e: { name: 'Yellow', hex: '#FFFF55' },
    f: { name: 'White', hex: '#FFFFFF' },
};

export const FORMATS: Record<string, { name: string; style: CSSProperties }> = {
    l: { name: 'Bold', style: { fontWeight: 700 } },
    o: { name: 'Italic', style: { fontStyle: 'italic' } },
    n: { name: 'Underline', style: { textDecoration: 'underline' } },
    m: { name: 'Strikethrough', style: { textDecoration: 'line-through' } },
    k: { name: 'Obfuscated', style: {} },
    r: { name: 'Reset', style: {} },
};

interface Run {
    text: string;
    style: CSSProperties;
}

/** The message split at its § codes into runs of styled text, one list per line. */
export function motdLines(motd: string): Run[][] {
    return motd.split(/\n|\\n/).slice(0, 2).map((line) => {
        const runs: Run[] = [];
        let style: CSSProperties = { color: COLOURS['7'].hex };
        let text = '';
        const flush = () => {
            if (text) runs.push({ text, style });
            text = '';
        };

        for (let index = 0; index < line.length; index++) {
            const code = line[index] === '§' ? line[index + 1]?.toLowerCase() : undefined;
            if (code === undefined || (!COLOURS[code] && !FORMATS[code])) {
                text += line[index];
                continue;
            }
            flush();
            index++;
            // A colour resets the formats, as in the game.
            if (COLOURS[code]) style = { color: COLOURS[code].hex };
            else if (code === 'r') style = { color: COLOURS['7'].hex };
            else if (code === 'k') style = { ...style, filter: 'blur(2px)' };
            else style = { ...style, ...FORMATS[code].style, textDecoration: [style.textDecoration, FORMATS[code].style.textDecoration].filter(Boolean).join(' ') || undefined };
        }
        flush();

        return runs;
    });
}

/** The message as the server list shows it, beside the server's icon. */
export function MotdPreview({ motd, icon, name }: { motd: string; icon?: ReactNode; name: string }) {
    return (
        <div className='mc:flex mc:items-center mc:gap-3 mc:rounded-sm mc:bg-terminal mc:p-3 mc:font-mono mc:text-sm' aria-label='Server list preview'>
            <div className='mc:flex mc:size-16 mc:shrink-0 mc:items-center mc:justify-center mc:overflow-hidden mc:rounded-xs mc:bg-black/40'>{icon}</div>
            <div className='mc:min-w-0 mc:leading-5'>
                <p className='mc:truncate mc:text-white'>{name}</p>
                {motdLines(motd).map((runs, line) => (
                    <p key={line} className='mc:truncate mc:whitespace-pre'>
                        {runs.length === 0 ? ' ' : runs.map((run, index) => (
                            <span key={index} style={run.style}>
                                {run.text}
                            </span>
                        ))}
                    </p>
                ))}
            </div>
        </div>
    );
}
