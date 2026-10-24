import { forwardRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@pterodactyl/sdk';
import { decorate, type Piece } from './decorate';
import type { Entry, LogLine } from './lines';
import type { Preferences } from './preferences';

const SIZES = { sm: '12px', md: '13.5px', lg: '15px' } as const;

const LEVEL_STYLE: Partial<Record<LogLine['level'], CSSProperties>> = {
    error: { background: 'rgba(239, 107, 115, 0.09)', boxShadow: 'inset 2px 0 0 #ef6b73' },
    warn: { background: 'rgba(232, 196, 106, 0.07)', boxShadow: 'inset 2px 0 0 #e8c46a' },
};

const pieceStyle = (piece: Piece): CSSProperties => ({
    color: piece.fg,
    background: piece.search ? 'rgba(250, 204, 21, 0.85)' : piece.highlight ? 'rgba(96, 165, 250, 0.35)' : piece.bg,
    ...(piece.search ? { color: '#111' } : {}),
    fontWeight: piece.bold ? 700 : undefined,
    opacity: piece.dim ? 0.7 : undefined,
    fontStyle: piece.italic ? 'italic' : undefined,
    textDecoration: [piece.underline && 'underline', piece.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    borderRadius: piece.search || piece.highlight ? 2 : undefined,
});

function Text({ line, search, highlights, onPath }: { line: LogLine; search: string; highlights: string[]; onPath: (path: string) => void }) {
    const pieces = decorate(line.segments, line.text, search, highlights);

    return (
        <>
            {pieces.map((piece, index) => {
                const content = <span style={pieceStyle(piece)}>{piece.text}</span>;
                if (piece.url) {
                    return (
                        <a key={index} href={piece.url} target='_blank' rel='noopener noreferrer' className='cx:underline cx:decoration-dotted cx:underline-offset-2 cx:hover:decoration-solid'>
                            {content}
                        </a>
                    );
                }
                if (piece.path) {
                    const path = piece.path;

                    return (
                        <button
                            key={index}
                            type='button'
                            title={`Open ${path}`}
                            onClick={() => onPath(path)}
                            className='cx:cursor-pointer cx:border-0 cx:bg-transparent cx:p-0 cx:font-[inherit] cx:text-[inherit] cx:underline cx:decoration-dotted cx:underline-offset-2 cx:hover:decoration-solid'
                        >
                            {content}
                        </button>
                    );
                }

                return <span key={index}>{content}</span>;
            })}
        </>
    );
}

const time = (line: LogLine) => (line.at ? line.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

function Row({
    line,
    view,
    current,
    children,
    after,
}: {
    line: LogLine;
    view: Preferences['view'];
    current?: boolean;
    children: ReactNode;
    after?: ReactNode;
}) {
    return (
        <div
            data-line={line.id}
            className={cn('cx:flex cx:gap-3 cx:px-2', current && 'cx:outline cx:outline-1 cx:-outline-offset-1 cx:outline-yellow-300/70')}
            style={{ ...LEVEL_STYLE[line.level], contentVisibility: 'auto', containIntrinsicSize: 'auto 1.45em' }}
        >
            {view.timestamps && <span className='cx:w-[5.5em] cx:shrink-0 cx:select-none cx:text-right cx:opacity-50'>{time(line)}</span>}
            <span className={cn('cx:min-w-0 cx:flex-1', view.wrap ? 'cx:whitespace-pre-wrap cx:break-all' : 'cx:whitespace-pre')}>
                {children}
                {after}
            </span>
        </div>
    );
}

/** The lines of the console, as entries: a folded stack trace opens on a click, repeats show a count. */
const LogView = forwardRef<
    HTMLDivElement,
    {
        entries: Entry[];
        view: Preferences['view'];
        search: string;
        highlights: string[];
        /** The line of the search result in focus. */
        current: number | null;
        /** Lines of folded traces that the search found, so their trace opens. */
        openTraces: Set<number>;
        onPath: (path: string) => void;
        onScroll: () => void;
    }
>(function LogView({ entries, view, search, highlights, current, openTraces, onPath, onScroll }, ref) {
    const [opened, setOpened] = useState<Set<number>>(new Set());
    const toggle = (id: number) =>
        setOpened((set) => {
            const next = new Set(set);
            if (!next.delete(id)) next.add(id);

            return next;
        });

    return (
        <div
            ref={ref}
            onScroll={onScroll}
            role='log'
            aria-live='off'
            // Focusable, so Ctrl+F reaches the console after a click on its lines.
            tabIndex={0}
            className='cx:absolute cx:inset-0 cx:overflow-auto cx:py-1 cx:font-mono'
            style={{ fontSize: SIZES[view.size], lineHeight: 1.45, color: '#d8dee9' }}
        >
            {entries.map((entry) => {
                const open = opened.has(entry.line.id) || openTraces.has(entry.line.id);

                return (
                    <div key={entry.line.id}>
                        <Row
                            line={entry.line}
                            view={view}
                            current={current === entry.line.id}
                            after={
                                <>
                                    {entry.repeats > 1 && (
                                        <span className='cx:ml-2 cx:select-none cx:rounded cx:bg-white/10 cx:px-1.5 cx:text-[0.85em] cx:opacity-80'>×{entry.repeats}</span>
                                    )}
                                    {entry.trace.length > 0 && (
                                        <button
                                            type='button'
                                            aria-expanded={open}
                                            onClick={() => toggle(entry.line.id)}
                                            className='cx:ml-2 cx:inline-flex cx:cursor-pointer cx:select-none cx:items-center cx:gap-1 cx:rounded cx:border-0 cx:bg-white/10 cx:px-1.5 cx:align-middle cx:text-[0.85em] cx:text-inherit cx:hover:bg-white/20'
                                        >
                                            {open ? <ChevronDown className='cx:size-3' aria-hidden /> : <ChevronRight className='cx:size-3' aria-hidden />}
                                            {entry.trace.length} trace line{entry.trace.length === 1 ? '' : 's'}
                                        </button>
                                    )}
                                </>
                            }
                        >
                            <Text line={entry.line} search={search} highlights={highlights} onPath={onPath} />
                        </Row>
                        {open &&
                            entry.trace.map((line) => (
                                <Row key={line.id} line={line} view={view} current={current === line.id}>
                                    <Text line={line} search={search} highlights={highlights} onPath={onPath} />
                                </Row>
                            ))}
                    </div>
                );
            })}
        </div>
    );
});

export default LogView;
