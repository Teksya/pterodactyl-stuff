import { useEffect, useRef, useState } from 'react';
import { ChevronsRight, History, Star } from 'lucide-react';
import { cn, DropdownMenu, DropdownMenuItem } from '@pterodactyl/sdk';
import { useSkin, type ServerConsoleCommand } from '@pterodactyl/sdk/theme';

/**
 * The panel's command line, with the user's saved history on the arrow keys and in a menu, and
 * their favourite commands as buttons that send at once.
 */
export default function CommandBar({
    command,
    history,
    favourites,
    onSent,
    onFavourite,
}: {
    command: ServerConsoleCommand;
    /** Newest last. */
    history: string[];
    favourites: string[];
    onSent: (command: string) => void;
    onFavourite: (command: string) => void;
}) {
    const [position, setPosition] = useState<number | null>(null);
    const pending = useRef<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const chip = useSkin('Button', { color: 'grey', size: 'xsmall', secondary: true, loading: false });

    // A favourite sets the line, then sends it once the panel has it.
    useEffect(() => {
        if (pending.current !== null && command.value === pending.current) {
            onSent(pending.current);
            pending.current = null;
            command.submit();
        }
    }, [command, onSent]);

    const recall = (index: number | null) => {
        setPosition(index);
        command.setValue(index === null ? '' : history[index]);
    };

    const send = (value: string) => {
        pending.current = value;
        command.setValue(value);
    };

    const disabled = command.disabled;
    const value = command.value.trim();

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
                <ChevronsRight className='cx:pointer-events-none cx:absolute cx:left-3 cx:size-4 cx:text-foreground' aria-hidden />
                <input
                    ref={input}
                    className={cn(
                        'cx:w-full cx:border-0 cx:border-b-2 cx:border-transparent cx:bg-transparent cx:py-2 cx:pr-24 cx:pl-10 cx:font-mono cx:text-sm cx:text-foreground',
                        'cx:outline-hidden cx:transition-colors cx:focus:border-accent cx:placeholder:text-muted-foreground'
                    )}
                    type='text'
                    placeholder='Type a command...'
                    aria-label='Console command input.'
                    disabled={disabled}
                    value={command.value}
                    autoCorrect='off'
                    autoCapitalize='none'
                    spellCheck={false}
                    onChange={(event) => {
                        setPosition(null);
                        command.setValue(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' && history.length > 0) {
                            event.preventDefault();
                            recall(position === null ? history.length - 1 : Math.max(0, position - 1));
                        } else if (event.key === 'ArrowDown' && position !== null) {
                            event.preventDefault();
                            recall(position + 1 < history.length ? position + 1 : null);
                        } else if (event.key === 'Enter' && value) {
                            onSent(value);
                            setPosition(null);
                            command.submit();
                        }
                    }}
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
