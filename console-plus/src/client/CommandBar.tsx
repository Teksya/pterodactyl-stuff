import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronsRight, History, Star } from 'lucide-react';
import { cn, DropdownMenu, DropdownMenuItem } from '@pterodactyl/sdk';
import { useSkin, type ServerConsoleCommand } from '@pterodactyl/sdk/theme';
import { accept, suggest, usage, type Game, type Suggestion } from './completion/complete';

/**
 * The panel's command line, with the user's saved history on the arrow keys and in a menu, their
 * favourite commands as buttons that send at once, and the game's commands completed as they type:
 * the arrows go through the suggestions, Tab or Enter takes one, Escape closes them.
 */
export default function CommandBar({
    command,
    history,
    favourites,
    game,
    onSent,
    onFavourite,
}: {
    command: ServerConsoleCommand;
    /** Newest last. */
    history: string[];
    favourites: string[];
    /** The server's game, whose commands are completed; null for none. */
    game: Game | null;
    onSent: (command: string) => void;
    onFavourite: (command: string) => void;
}) {
    const [position, setPosition] = useState<number | null>(null);
    // The suggestions show while the user types, until Escape, a send or a line from the history.
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(-1);
    const [caret, setCaret] = useState<number | null>(null);
    const pending = useRef<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const id = useId();
    const chip = useSkin('Button', { color: 'grey', size: 'xsmall', secondary: true, loading: false });

    const completion = useMemo(() => (open ? suggest(game, command.value, history, caret ?? command.value.length) : null), [open, game, command.value, history, caret]);
    const items = completion?.items ?? [];
    const typed = completion ? command.value.slice(completion.from, completion.to) : '';

    // A word being typed preselects the first suggestion (the commands sent before stay for the arrows);
    // after a space, nothing is: Enter sends the line as it is.
    useEffect(() => {
        setSelected(typed.trim() ? items.findIndex((item) => item.kind !== 'history') : -1);
    }, [completion]);

    useEffect(() => {
        if (selected >= 0) list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }, [selected]);

    // A favourite sets the line, then sends it once the panel has it.
    useEffect(() => {
        if (pending.current !== null && command.value === pending.current) {
            onSent(pending.current);
            pending.current = null;
            command.submit();
        }
    }, [command, onSent]);

    // After a suggestion the cursor goes after it, once the panel has the line.
    useLayoutEffect(() => {
        if (caret !== null && input.current && document.activeElement === input.current) input.current.setSelectionRange(caret, caret);
    }, [caret, command.value]);

    const recall = (index: number | null) => {
        setPosition(index);
        setOpen(false);
        setCaret(null);
        command.setValue(index === null ? '' : history[index]);
    };

    const send = (value: string) => {
        pending.current = value;
        command.setValue(value);
    };

    const take = (item: Suggestion) => {
        if (!completion) return;
        const next = accept(command.value, completion, item);
        setPosition(null);
        setCaret(next.cursor);
        command.setValue(next.line);
        input.current?.focus();
    };

    const disabled = command.disabled;
    const value = command.value.trim();
    const shown = open && completion !== null && !disabled;
    const active = shown && selected >= 0 ? items[selected] : null;
    // The usage of the command being typed; in the list of commands, of the one picked.
    const signature = completion?.signature ?? (active?.node ? usage(active.node) : null);

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        const browsing = shown && items.length > 0;
        if (browsing && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setSelected((index) => (index === -1 && step === -1 ? items.length - 1 : (index + step + items.length) % items.length));
        } else if (event.key === 'Tab' && !event.shiftKey && (browsing || (!shown && suggest(game, command.value, history) !== null))) {
            // Tab stays in the line only when it has something to offer.
            event.preventDefault();
            if (browsing) take(items[Math.max(selected, 0)]);
            else setOpen(true);
        } else if (event.key === ' ' && event.ctrlKey) {
            event.preventDefault();
            setOpen(true);
        } else if (event.key === 'Escape' && shown) {
            // Only the suggestions close: not the full screen around the console.
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        } else if (event.key === 'ArrowUp' && history.length > 0) {
            event.preventDefault();
            recall(position === null ? history.length - 1 : Math.max(0, position - 1));
        } else if (event.key === 'ArrowDown' && position !== null) {
            event.preventDefault();
            recall(position + 1 < history.length ? position + 1 : null);
        } else if (event.key === 'Enter') {
            // Enter takes the suggestion picked, unless it is the word already typed: then it sends.
            if (active && completion && accept(command.value, completion, active).line.trim() !== value && active.value.toLowerCase() !== typed.toLowerCase()) {
                event.preventDefault();
                take(active);
            } else if (value) {
                onSent(value);
                setPosition(null);
                setOpen(false);
                command.submit();
            }
        }
    };

    return (
        <div className='cx:rounded-b-sm cx:bg-terminal'>
            {favourites.length > 0 && (
                <div className='cx:flex cx:flex-wrap cx:gap-1.5 cx:border-t cx:border-white/5 cx:px-2 cx:pt-2'>
                    {favourites.map((favourite) => (
                        <button
                            key={favourite}
                            type='button'
                            disabled={disabled}
                            title={`Send ${favourite}`}
                            onClick={() => send(favourite)}
                            className={chip.classes('root', 'cx:max-w-[16rem] cx:truncate cx:font-mono cx:normal-case')}
                        >
                            {favourite}
                        </button>
                    ))}
                </div>
            )}
            <div className='cx:relative cx:flex cx:items-center'>
                {shown && (items.length > 0 || signature) && (
                    <div className='cx:absolute cx:right-2 cx:bottom-full cx:left-2 cx:z-20 cx:mb-1.5 cx:flex cx:max-w-4xl cx:flex-col cx:gap-1.5 cx:text-sm'>
                        {items.length > 0 && (
                            <div
                                ref={list}
                                id={`${id}-list`}
                                role='listbox'
                                aria-label='Suggestions'
                                className='cx:max-h-64 cx:overflow-y-auto cx:rounded-md cx:border cx:border-white/10 cx:bg-popover cx:py-1 cx:shadow-lg'
                            >
                                {items.map((item, index) => (
                                    <div
                                        key={`${item.kind}:${item.value}`}
                                        id={`${id}-${index}`}
                                        data-index={index}
                                        role='option'
                                        aria-selected={index === selected}
                                        // Pressing an item would blur the line first.
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => take(item)}
                                        onMouseMove={() => index !== selected && setSelected(index)}
                                        className={cn(
                                            'cx:flex cx:cursor-pointer cx:items-baseline cx:gap-4 cx:px-3 cx:py-1.5',
                                            index === selected ? 'cx:bg-accent cx:text-accent-foreground' : 'cx:text-foreground'
                                        )}
                                    >
                                        <span className='cx:flex cx:min-w-0 cx:shrink-0 cx:items-baseline cx:gap-2 cx:font-mono'>
                                            {item.kind === 'history' && <History className='cx:size-3.5 cx:shrink-0 cx:self-center cx:opacity-70' aria-hidden />}
                                            <span className='cx:truncate'>
                                                <Matched value={item.value} typed={item.kind === 'history' ? value : item.insert ? '' : typed.replace(/^"/, '')} picked={index === selected} />
                                            </span>
                                        </span>
                                        {item.detail && (
                                            <span
                                                className={cn(
                                                    'cx:min-w-0 cx:truncate',
                                                    item.kind === 'value' ? 'cx:font-mono' : 'cx:text-xs',
                                                    index === selected ? 'cx:text-accent-foreground/90' : 'cx:text-muted-foreground'
                                                )}
                                            >
                                                {item.detail}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className='cx:rounded-md cx:border cx:border-white/10 cx:bg-popover cx:px-3 cx:py-2 cx:shadow-lg'>
                            {signature && (
                                <div className='cx:truncate cx:font-mono' aria-live='polite'>
                                    {signature.parts.map((part, index) => (
                                        <Fragment key={index}>
                                            {index > 0 && ' '}
                                            <span className={part.role === 'current' ? 'cx:font-bold cx:text-foreground cx:underline cx:underline-offset-4' : 'cx:text-muted-foreground'}>
                                                {part.text}
                                            </span>
                                        </Fragment>
                                    ))}
                                </div>
                            )}
                            {signature?.description && <div className='cx:mt-1 cx:text-foreground/90'>{signature.description}</div>}
                            <div className={cn('cx:flex cx:items-center cx:gap-3 cx:text-xs cx:text-muted-foreground', signature && 'cx:mt-1.5')}>
                                <span className='cx:truncate'>Tab to complete · ↑↓ to choose · Esc to hide</span>
                                <span className='cx:ml-auto cx:hidden cx:shrink-0 cx:sm:inline'>{game?.name ?? 'Commands sent before'}</span>
                            </div>
                        </div>
                    </div>
                )}
                <ChevronsRight className='cx:pointer-events-none cx:absolute cx:left-3 cx:size-4 cx:text-foreground' aria-hidden />
                <input
                    ref={input}
                    className={cn(
                        'cx:w-full cx:border-0 cx:border-b-2 cx:border-transparent cx:bg-transparent cx:py-2 cx:pr-24 cx:pl-10 cx:font-mono cx:text-sm cx:text-foreground',
                        'cx:outline-hidden cx:transition-colors cx:focus:border-accent cx:placeholder:text-muted-foreground'
                    )}
                    type='text'
                    role='combobox'
                    placeholder='Type a command...'
                    aria-label='Console command input.'
                    aria-autocomplete='list'
                    aria-expanded={shown && items.length > 0}
                    aria-controls={shown && items.length > 0 ? `${id}-list` : undefined}
                    aria-activedescendant={active ? `${id}-${selected}` : undefined}
                    disabled={disabled}
                    value={command.value}
                    autoCorrect='off'
                    autoCapitalize='none'
                    autoComplete='off'
                    spellCheck={false}
                    onChange={(event) => {
                        setPosition(null);
                        setCaret(event.currentTarget.selectionStart);
                        setOpen(true);
                        command.setValue(event.currentTarget.value);
                    }}
                    onBlur={() => setOpen(false)}
                    onKeyDown={onKeyDown}
                />
                <div className='cx:absolute cx:right-2 cx:flex cx:items-center cx:gap-1'>
                    <button
                        type='button'
                        disabled={!value || favourites.includes(value)}
                        title={favourites.includes(value) ? 'Already a favourite' : 'Add to favourites'}
                        aria-label='Add the command to favourites'
                        onClick={() => onFavourite(value)}
                        className='cx:flex cx:size-7 cx:cursor-pointer cx:items-center cx:justify-center cx:rounded cx:border-0 cx:bg-transparent cx:text-muted-foreground cx:hover:text-foreground cx:disabled:cursor-default cx:disabled:opacity-40'
                    >
                        <Star className='cx:size-4' aria-hidden />
                    </button>
                    {history.length > 0 && (
                        <DropdownMenu
                            triggerClassName='cx:flex cx:size-7 cx:cursor-pointer cx:items-center cx:justify-center cx:rounded cx:border-0 cx:bg-transparent cx:text-muted-foreground cx:hover:text-foreground'
                            triggerContent={
                                <>
                                    <History className='cx:size-4' aria-hidden />
                                    <span className='cx:sr-only'>Command history</span>
                                </>
                            }
                        >
                            {[...history]
                                .reverse()
                                .slice(0, 15)
                                .map((item) => (
                                    <DropdownMenuItem
                                        key={item}
                                        className='cx:font-mono'
                                        onClick={() => {
                                            setPosition(history.lastIndexOf(item));
                                            setOpen(false);
                                            command.setValue(item);
                                            input.current?.focus();
                                        }}
                                    >
                                        {item}
                                    </DropdownMenuItem>
                                ))}
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </div>
    );
}

/** A suggestion with the part typed in bold (and in the accent colour, unless the row is picked: it has that colour). */
function Matched({ value, typed, picked }: { value: string; typed: string; picked: boolean }) {
    const at = typed ? value.toLowerCase().indexOf(typed.toLowerCase()) : -1;
    if (at === -1) return <>{value}</>;

    return (
        <>
            {value.slice(0, at)}
            <span className={picked ? 'cx:font-bold' : 'cx:font-semibold cx:text-accent'}>{value.slice(at, at + typed.length)}</span>
            {value.slice(at + typed.length)}
        </>
    );
}
