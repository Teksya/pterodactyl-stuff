import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ChevronDown, ChevronUp, Download, Eraser, ListFilter, Maximize2, Minimize2, Search, Settings2, X } from 'lucide-react';
import {
    Badge,
    cn,
    DropdownMenu,
    DropdownMenuItem,
    Input,
    RowActionButton,
    SpinnerOverlay,
    useCurrentServer,
    usePanelNavigate,
} from '@pterodactyl/sdk';
import { useSkin, type ViewProps } from '@pterodactyl/sdk/theme';
import ChoiceMenu from './ChoiceMenu';
import CommandBar from './CommandBar';
import { useGame } from './completion/useGame';
import { find } from './decorate';
import { asText, countLevels, entries as toEntries, matcher } from './lines';
import LogView from './LogView';
import { remember, usePreferences, type Preferences } from './preferences';
import RulesDialog from './RulesDialog';
import { useConsoleLines } from './useConsoleLines';

const LEVELS: { value: Preferences['view']['level']; label: string }[] = [
    { value: 'all', label: 'Everything' },
    { value: 'warn', label: 'Warnings and errors' },
    { value: 'error', label: 'Errors' },
];

const SIZES: { value: Preferences['view']['size']; label: string }[] = [
    { value: 'sm', label: 'Small text' },
    { value: 'md', label: 'Medium text' },
    { value: 'lg', label: 'Large text' },
];

const TOGGLES: { key: 'timestamps' | 'wrap' | 'traces' | 'repeats' | 'toolbar' | 'original'; label: string }[] = [
    { key: 'timestamps', label: 'Show the time of each line' },
    { key: 'wrap', label: 'Wrap long lines' },
    { key: 'traces', label: 'Fold stack traces' },
    { key: 'repeats', label: 'Fold repeated lines' },
    { key: 'toolbar', label: 'Always show this bar' },
    { key: 'original', label: "The panel's own cards and graphs" },
];

/**
 * The server's console as text: searchable, filtered by level, coloured, with folded stack
 * traces, clickable links and files, hidden noise and highlighted words, a saved command history,
 * favourite commands and the game's commands completed as they are typed. In place of the panel's
 * terminal, under the same command permissions.
 */
export default function ConsoleView({ model, className }: ViewProps<'server.terminal'>) {
    const server = useCurrentServer();
    const uuid = server?.attributes.uuid ?? '';
    const identifier = server?.attributes.identifier ?? '';
    const navigate = usePanelNavigate();
    const { lines, loading, clear } = useConsoleLines(uuid);
    const game = useGame(uuid, lines);
    const { preferences, update } = usePreferences(uuid);
    const view = preferences.view;
    const setView = (change: Partial<Preferences['view']>) => update((current) => ({ ...current, view: { ...current.view, ...change } }));

    const [search, setSearch] = useState('');
    const [current, setCurrent] = useState(0);
    const [rules, setRules] = useState(false);
    const [full, setFull] = useState(false);
    // The bar stays out of the way until Ctrl+F or its button, unless the user keeps it shown.
    const [opened, setOpened] = useState(false);
    const toolbar = view.toolbar || opened;
    const [following, setFollowing] = useState(true);
    const follow = useRef(true);
    const log = useRef<HTMLDivElement>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const iconButton = useSkin('Button', { color: 'grey', size: 'xsmall', secondary: true, loading: false });

    const hide = useMemo(() => preferences.hide.map(matcher), [preferences.hide]);
    const shown = useMemo(
        () => toEntries(lines, { level: view.level, traces: view.traces, repeats: view.repeats }, hide),
        [lines, view.level, view.traces, view.repeats, hide]
    );
    const counts = useMemo(() => countLevels(lines), [lines]);
    const matches = useMemo(() => {
        const ids: number[] = [];
        const openTraces = new Set<number>();
        if (!search.trim()) return { ids, openTraces };
        for (const entry of shown) {
            if (find(entry.line.text, search).length > 0) ids.push(entry.line.id);
            for (const line of entry.trace) {
                if (find(line.text, search).length > 0) {
                    ids.push(line.id);
                    openTraces.add(entry.line.id);
                }
            }
        }

        return { ids, openTraces };
    }, [shown, search]);
    const focused = matches.ids.length > 0 ? matches.ids[Math.min(current, matches.ids.length - 1)] : null;

    // New lines keep the view at the bottom, unless the user scrolled up to read.
    useLayoutEffect(() => {
        if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    }, [shown, view.wrap, view.size, full]);

    useEffect(() => {
        if (focused === null || !log.current) return;
        follow.current = false;
        setFollowing(false);
        log.current.querySelector(`[data-line="${focused}"]`)?.scrollIntoView?.({ block: 'center' });
    }, [focused]);

    useEffect(() => {
        if (!full) return;
        const close = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setFull(false);
        window.addEventListener('keydown', close);

        return () => window.removeEventListener('keydown', close);
    }, [full]);

    const onScroll = useCallback(() => {
        const element = log.current;
        if (!element) return;
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        follow.current = atBottom;
        setFollowing(atBottom);
    }, []);

    const toBottom = () => {
        follow.current = true;
        setFollowing(true);
        if (log.current) log.current.scrollTop = log.current.scrollHeight;
    };

    const step = (by: 1 | -1) => {
        if (matches.ids.length === 0) return;
        setCurrent((index) => (Math.min(index, matches.ids.length - 1) + by + matches.ids.length) % matches.ids.length);
    };

    const download = () => {
        const blob = new Blob([asText(lines)], { type: 'text/plain' });
        const link = document.createElement('a');
        const name = (server?.attributes.name ?? 'console').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '');
        link.href = URL.createObjectURL(blob);
        link.download = `${name || 'console'}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.log`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const openFile = useCallback(
        (path: string) => void navigate({ to: '/server/$id/files/$action', params: { id: identifier, action: 'edit' }, hash: `/${path}` }),
        [navigate, identifier]
    );

    const openToolbar = () => {
        setOpened(true);
        // The field exists once the bar renders.
        requestAnimationFrame(() => {
            searchInput.current?.focus();
            searchInput.current?.select();
        });
    };

    const closeToolbar = () => {
        setSearch('');
        setOpened(false);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            openToolbar();
        }
    };

    const level = (value: Preferences['view']['level']) => setView({ level: view.level === value ? 'all' : value });

    return (
        <div
            onKeyDown={onKeyDown}
            className={cn('cx:relative cx:flex cx:w-full cx:flex-col', className, full && 'cx:fixed cx:inset-0 cx:z-50 cx:bg-background cx:p-4')}
        >
            {toolbar && (
                <div className='cx:flex cx:flex-wrap cx:items-center cx:gap-2 cx:rounded-t-sm cx:border-b cx:border-white/5 cx:bg-terminal cx:px-2 cx:py-2'>
                    <div className='cx:relative cx:w-full cx:sm:w-64'>
                        <Search className='cx:pointer-events-none cx:absolute cx:top-1/2 cx:left-2.5 cx:z-10 cx:size-4 cx:-translate-y-1/2 cx:text-muted-foreground' aria-hidden />
                        <Input
                            ref={searchInput}
                            aria-label='Search the console'
                            placeholder='Search… (/regex/)'
                            className='cx:h-8 cx:pr-28 cx:pl-8 cx:text-sm'
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setCurrent(0);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') step(event.shiftKey ? -1 : 1);
                                // Escape clears the search, then closes the bar.
                                if (event.key === 'Escape') {
                                    if (search) setSearch('');
                                    else if (!view.toolbar) closeToolbar();
                                }
                            }}
                        />
                        {search.trim() && (
                            <div className='cx:absolute cx:top-1/2 cx:right-1 cx:flex cx:-translate-y-1/2 cx:items-center cx:gap-0.5 cx:text-xs cx:text-muted-foreground'>
                                <span className='cx:mr-1 cx:tabular-nums'>{matches.ids.length > 0 ? `${Math.min(current, matches.ids.length - 1) + 1}/${matches.ids.length}` : '0/0'}</span>
                                <button type='button' aria-label='Previous match' onClick={() => step(-1)} className='cx:flex cx:size-6 cx:cursor-pointer cx:items-center cx:justify-center cx:rounded cx:border-0 cx:bg-transparent cx:text-inherit cx:hover:text-foreground'>
                                    <ChevronUp className='cx:size-4' aria-hidden />
                                </button>
                                <button type='button' aria-label='Next match' onClick={() => step(1)} className='cx:flex cx:size-6 cx:cursor-pointer cx:items-center cx:justify-center cx:rounded cx:border-0 cx:bg-transparent cx:text-inherit cx:hover:text-foreground'>
                                    <ChevronDown className='cx:size-4' aria-hidden />
                                </button>
                            </div>
                        )}
                    </div>
                    <ChoiceMenu label='Show' value={view.level} options={LEVELS} onChange={(value) => setView({ level: value })} />
                    <button type='button' aria-pressed={view.level === 'error'} title='Show errors only' onClick={() => level('error')} className='cx:cursor-pointer cx:border-0 cx:bg-transparent cx:p-0'>
                        <Badge size='sm' tone='danger' variant={view.level === 'error' ? undefined : 'soft'}>
                            {counts.error} error{counts.error === 1 ? '' : 's'}
                        </Badge>
                    </button>
                    <button type='button' aria-pressed={view.level === 'warn'} title='Show warnings and errors' onClick={() => level('warn')} className='cx:cursor-pointer cx:border-0 cx:bg-transparent cx:p-0'>
                        <Badge size='sm' tone='warning' variant={view.level === 'warn' ? undefined : 'soft'}>
                            {counts.warn} warning{counts.warn === 1 ? '' : 's'}
                        </Badge>
                    </button>
                    <div className='cx:ml-auto cx:flex cx:items-center cx:gap-1'>
                        <DropdownMenu
                            triggerClassName={iconButton.classes('root')}
                            triggerContent={
                                <>
                                    <Settings2 className='cx:size-3.5' aria-hidden />
                                    <span className='cx:sr-only'>Display options</span>
                                </>
                            }
                        >
                            {TOGGLES.map((toggle) => (
                                <DropdownMenuItem key={toggle.key} checked={view[toggle.key]} onClick={() => setView({ [toggle.key]: !view[toggle.key] })}>
                                    {toggle.label}
                                </DropdownMenuItem>
                            ))}
                            {SIZES.map((size) => (
                                <DropdownMenuItem key={size.value} checked={view.size === size.value} onClick={() => setView({ size: size.value })}>
                                    {size.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenu>
                        <RowActionButton icon={ListFilter} label='Hide, highlight and favourites' aria-label='Console rules' onClick={() => setRules(true)} />
                        <RowActionButton icon={Download} label='Download the log' aria-label='Download the log' onClick={download} disabled={lines.length === 0} />
                        <RowActionButton icon={Eraser} label='Clear the console' aria-label='Clear the console' onClick={clear} disabled={lines.length === 0} />
                        <RowActionButton
                            icon={full ? Minimize2 : Maximize2}
                            label={full ? 'Leave full screen' : 'Full screen'}
                            aria-label={full ? 'Leave full screen' : 'Full screen'}
                            onClick={() => setFull(!full)}
                        />
                        {!view.toolbar && <RowActionButton icon={X} label='Close (Escape)' aria-label='Close the toolbar' onClick={closeToolbar} />}
                    </div>
                </div>
            )}
            <div className={cn('cx:relative cx:min-h-[16rem] cx:flex-1 cx:bg-terminal', !toolbar && 'cx:rounded-t-sm', !model.command.allowed && 'cx:rounded-b-sm')}>
                <SpinnerOverlay visible={loading} size='large' />
                <LogView
                    ref={log}
                    entries={shown}
                    view={view}
                    search={search}
                    highlights={preferences.highlight}
                    current={focused}
                    openTraces={matches.openTraces}
                    onPath={openFile}
                    onScroll={onScroll}
                />
                {!toolbar && (
                    <button
                        type='button'
                        onClick={openToolbar}
                        title='Search, filters and tools (Ctrl+F)'
                        aria-label='Open the toolbar'
                        className='cx:absolute cx:top-2 cx:right-4 cx:z-10 cx:flex cx:cursor-pointer cx:items-center cx:gap-1.5 cx:rounded-md cx:border-0 cx:bg-popover/70 cx:px-2 cx:py-1 cx:text-xs cx:text-foreground cx:opacity-50 cx:transition-opacity cx:hover:opacity-100 cx:focus-visible:opacity-100'
                    >
                        <Search className='cx:size-3.5' aria-hidden />
                        {/* A filter still applies with the bar closed: say so. */}
                        {view.level !== 'all' && <span>{view.level === 'error' ? 'Errors only' : 'Warnings and errors'}</span>}
                    </button>
                )}
                {!following && (
                    <button
                        type='button'
                        onClick={toBottom}
                        className='cx:absolute cx:right-5 cx:bottom-3 cx:z-10 cx:flex cx:cursor-pointer cx:items-center cx:gap-1.5 cx:rounded-full cx:border-0 cx:bg-popover/90 cx:px-3 cx:py-1.5 cx:text-xs cx:text-foreground cx:shadow-lg cx:hover:bg-popover'
                    >
                        <ArrowDown className='cx:size-3.5' aria-hidden />
                        Latest lines
                    </button>
                )}
            </div>
            {model.command.allowed && (
                <CommandBar
                    command={model.command}
                    history={preferences.history}
                    favourites={preferences.favourites}
                    game={game}
                    onSent={(sent) => update((current) => ({ ...current, history: remember(current.history, sent) }))}
                    onFavourite={(favourite) => update((current) => ({ ...current, favourites: [...current.favourites, favourite].slice(0, 50) }))}
                />
            )}
            <RulesDialog open={rules} preferences={preferences} onClose={() => setRules(false)} onSave={(change) => update((current) => ({ ...current, ...change }))} />
        </div>
    );
}
