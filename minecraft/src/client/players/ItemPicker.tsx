import { useMemo, useState } from 'react';
import { Button, Dialog, Input, Label, NumberInput, Spinner, cn } from '@pterodactyl/sdk';
import { ItemIcon } from '../textures';
import { useItemCatalog, type CatalogItem } from './catalog';

interface Props {
    open: boolean;
    title: string;
    /** The server's version, for its list of items. */
    version: string | null;
    /** The most a slot takes: 64 for an offline player's slot, more for /give. */
    maxCount: number;
    pending: boolean;
    onClose: () => void;
    onPick: (id: string, count: number) => void;
}

const SHOWN = 120;

/** Picks an item of the server's version by name, or takes any id typed (mods' items). */
export default function ItemPicker({ open, title, version, maxCount, pending, onClose, onPick }: Props) {
    const catalog = useItemCatalog(open ? version : undefined);
    const [search, setSearch] = useState('');
    const [chosen, setChosen] = useState<CatalogItem | null>(null);
    const [count, setCount] = useState<number | null>(1);

    const needle = search.trim().toLowerCase();
    const matches = useMemo(
        () => (catalog.data ?? []).filter((item) => !needle || item.name.includes(needle.replace(/^minecraft:/, '').replace(/ /g, '_')) || item.displayName.toLowerCase().includes(needle)),
        [catalog.data, needle]
    );
    // A typed id such as "create:wrench" works even when it is not in the list.
    const typed = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(needle) ? needle : null;
    const id = chosen ? `minecraft:${chosen.name}` : typed;
    // One slot holds a stack at most; /give spreads larger counts over several.
    const stack = chosen && maxCount <= 64 ? Math.min(maxCount, chosen.stackSize) : maxCount;

    const close = () => {
        setSearch('');
        setChosen(null);
        setCount(1);
        onClose();
    };

    return (
        <Dialog open={open} onClose={close} title={title}>
            <div className='mc:flex mc:flex-col mc:gap-3'>
                <Input
                    aria-label='Find an item'
                    placeholder={catalog.isError || !catalog.data ? 'An item id, such as minecraft:diamond' : 'Find an item, or type an id'}
                    value={search}
                    autoFocus
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        setChosen(null);
                    }}
                />
                {catalog.isFetching && <Spinner centered />}
                {catalog.data && (
                    <div className='mc:grid mc:max-h-72 mc:grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] mc:gap-1 mc:overflow-y-auto mc:rounded-sm mc:bg-sunken mc:p-2' role='listbox' aria-label='Items'>
                        {matches.slice(0, SHOWN).map((item) => (
                            <button
                                key={item.name}
                                type='button'
                                role='option'
                                aria-selected={chosen?.name === item.name}
                                title={item.displayName}
                                onClick={() => setChosen(item)}
                                className={cn(
                                    'mc:flex mc:aspect-square mc:cursor-pointer mc:items-center mc:justify-center mc:rounded-xs mc:border mc:bg-[#8b8b8b] mc:p-1',
                                    chosen?.name === item.name ? 'mc:border-primary mc:ring-2 mc:ring-primary' : 'mc:border-transparent mc:hover:border-border'
                                )}
                            >
                                <ItemIcon id={`minecraft:${item.name}`} />
                            </button>
                        ))}
                    </div>
                )}
                {catalog.data && matches.length > SHOWN && <p className='mc:m-0 mc:text-xs mc:text-muted-foreground'>{matches.length - SHOWN} more: narrow the search.</p>}
                <div className='mc:flex mc:items-end mc:gap-3'>
                    <div className='mc:min-w-0 mc:flex-1'>
                        <p className='mc:m-0 mc:text-xs mc:text-muted-foreground'>Item</p>
                        <p className='mc:m-0 mc:truncate mc:font-medium'>{chosen ? chosen.displayName : (typed ?? '—')}</p>
                    </div>
                    <div className='mc:w-28'>
                        <Label htmlFor='mc-pick-count'>Count</Label>
                        <NumberInput id='mc-pick-count' value={count} min={1} max={stack} onValueChange={setCount} />
                    </div>
                </div>
            </div>
            <Dialog.Footer>
                <Button isSecondary onClick={close}>
                    Cancel
                </Button>
                <Button
                    isLoading={pending}
                    disabled={!id || !count}
                    onClick={() => {
                        if (id && count) onPick(id, Math.min(count, stack));
                    }}
                >
                    Give
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
