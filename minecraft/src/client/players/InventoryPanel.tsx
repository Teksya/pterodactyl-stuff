import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { ContextDropdownMenu, DropdownMenuItem, Tooltip, cn } from '@pterodactyl/sdk';
import { ItemIcon } from '../textures';
import type { ArmorPart, Item, Profile, Slot } from '../types';
import { displayName, durability, level, maxDurability } from './items';

// As the Pelican plugin lays them out: the off hand, the 27 slots over the hotbar, then the armour.
const ARMOR: { part: ArmorPart; label: string }[] = [
    { part: 'head', label: 'Helmet' },
    { part: 'chest', label: 'Chestplate' },
    { part: 'legs', label: 'Leggings' },
    { part: 'feet', label: 'Boots' },
];

export interface SlotActions {
    /** Moves an item; `occupied` when the target holds one (online, only empty targets are allowed). */
    onMove: (from: Slot, to: Slot, occupied: boolean) => void;
    onRemove: (slot: Slot, item: Item) => void;
    /** An empty slot was clicked: give an item there. */
    onPick: (slot: Slot) => void;
}

interface Props {
    profile: Profile;
    /** Absent when the items cannot be changed. */
    actions?: SlotActions;
}

/** The slots grow with the room they have, and the three parts stack when it is narrow. */
function Frame({ children }: { children: ReactNode }) {
    return (
        <div className='mc:flex mc:w-full mc:justify-center mc:@container'>
            <div className='mc:flex mc:w-fit mc:max-w-full mc:items-center mc:justify-center mc:gap-3 mc:rounded-xl mc:border mc:border-border mc:bg-sunken/60 mc:p-3 mc:@max-lg:flex-col mc:@max-lg:gap-2 mc:sm:p-4'>
                {children}
            </div>
        </div>
    );
}

/** The inventory as the Pelican plugin draws it: off hand, the 27 slots over the hotbar, the armour. */
export default function InventoryPanel({ profile, actions }: Props) {
    const items = new Map((profile.inventory ?? []).map((item) => [item.slot, item]));
    const slot = (index: number, hotbar = false) => (
        <SlotView key={index} slot={`inventory.${index}`} item={items.get(`inventory.${index}`)} selected={index === profile.selectedSlot} kind={hotbar ? 'hotbar' : 'slot'} actions={actions} />
    );

    return (
        <Frame>
            <div className='mc:flex mc:shrink-0 mc:items-center mc:justify-center mc:@max-lg:w-full mc:@max-lg:border-b mc:@max-lg:border-border mc:@max-lg:pb-2'>
                <SlotView slot='offhand' item={profile.offhand ?? undefined} placeholder='Off hand' kind='gear' actions={actions} />
            </div>
            <div className='mc:flex mc:shrink-0 mc:flex-col mc:gap-1.5 mc:border-l mc:border-border mc:pl-3 mc:@max-lg:border-l-0 mc:@max-lg:pl-0 mc:sm:gap-2'>
                <Grid label='Inventory'>{Array.from({ length: 27 }, (_, index) => slot(index + 9))}</Grid>
                <div className='mc:mt-1 mc:sm:mt-2'>
                    <Grid label='Hotbar'>{Array.from({ length: 9 }, (_, index) => slot(index, true))}</Grid>
                </div>
            </div>
            <div
                role='group'
                aria-label='Armor'
                className='mc:flex mc:shrink-0 mc:flex-col mc:gap-1.5 mc:border-l mc:border-border mc:pl-3 mc:@max-lg:w-full mc:@max-lg:flex-row mc:@max-lg:justify-center mc:@max-lg:border-t mc:@max-lg:border-l-0 mc:@max-lg:pt-2 mc:@max-lg:pl-0 mc:sm:gap-2'
            >
                {ARMOR.map(({ part, label }) => (
                    <SlotView key={part} slot={`armor.${part}`} item={profile.armor?.[part] ?? undefined} placeholder={label} kind='gear' actions={actions} />
                ))}
            </div>
        </Frame>
    );
}

/** The ender chest: three rows of nine. */
export function EnderChestPanel({ items, actions }: { items: Item[]; actions?: SlotActions }) {
    const bySlot = new Map(items.map((item) => [item.slot, item]));

    return (
        <Frame>
            <Grid label='Ender chest'>
                {Array.from({ length: 27 }, (_, index) => (
                    <SlotView key={index} slot={`ender.${index}`} item={bySlot.get(`ender.${index}`)} kind='slot' actions={actions} />
                ))}
            </Grid>
        </Frame>
    );
}

function Grid({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div role='group' aria-label={label} className='mc:grid mc:w-fit mc:grid-cols-9 mc:gap-1.5 mc:@max-xs:gap-[0.2rem] mc:sm:gap-2'>
            {children}
        </div>
    );
}

interface SlotProps {
    slot: Slot;
    item: Item | undefined;
    selected?: boolean;
    placeholder?: string;
    /** Inventory slots are raised, the hotbar's have a thicker border, the armour and off hand are sunk. */
    kind: 'slot' | 'hotbar' | 'gear';
    actions?: SlotActions;
}

function SlotView({ slot, item, selected, placeholder, kind, actions }: SlotProps) {
    const frame = cn(
        'mc:relative mc:flex mc:size-[clamp(1.4rem,5.2cqw,2.5rem)] mc:shrink-0 mc:items-center mc:justify-center mc:rounded-md mc:border-border mc:p-0 mc:transition',
        kind === 'gear' ? 'mc:border mc:bg-sunken mc:shadow-inner' : 'mc:bg-card mc:shadow-sm mc:hover:border-primary mc:hover:ring-2 mc:hover:ring-primary',
        kind === 'hotbar' ? 'mc:border-2' : kind === 'slot' && 'mc:border',
        selected && 'mc:border-primary'
    );
    const drop = actions
        ? {
              onDragOver: (event: React.DragEvent) => event.preventDefault(),
              onDrop: (event: React.DragEvent) => {
                  event.preventDefault();
                  const from = event.dataTransfer.getData('text/x-minecraft-slot');
                  if (from && from !== slot) actions.onMove(from, slot, item !== undefined);
              },
          }
        : {};

    if (!item) {
        return (
            <button
                type='button'
                data-slot={slot}
                aria-label={placeholder ? `${placeholder}: empty` : 'Empty slot'}
                title={actions ? 'Give an item here' : placeholder}
                disabled={!actions}
                onClick={() => actions?.onPick(slot)}
                className={cn(frame, 'mc:cursor-default mc:enabled:cursor-pointer')}
                {...drop}
            >
                {placeholder && <span className='mc:text-center mc:text-xs mc:leading-none mc:text-muted-foreground mc:opacity-50'>{placeholder === 'Off hand' ? 'O' : placeholder[0]}</span>}
            </button>
        );
    }

    const left = durability(item);
    const tile = (
        <div
            tabIndex={0}
            data-slot={slot}
            aria-label={`${item.count} × ${item.name ?? displayName(item.id)}`}
            draggable={actions !== undefined}
            onDragStart={(event) => {
                event.dataTransfer.setData('text/x-minecraft-slot', slot);
                event.dataTransfer.effectAllowed = 'move';
            }}
            className={cn(frame, actions && 'mc:cursor-grab', 'mc:outline-none mc:focus-visible:ring-2 mc:focus-visible:ring-ring')}
            {...drop}
        >
            <span className='mc:flex mc:size-[70%] mc:items-center mc:justify-center'>
                <ItemIcon id={item.id} className={item.enchantments.length > 0 ? 'mc:drop-shadow-[0_0_3px_#c084fc]' : undefined} />
            </span>
            {item.count > 1 && (
                <span className='mc:absolute mc:right-0 mc:bottom-0 mc:rounded-tl-sm mc:bg-secondary/80 mc:px-1 mc:pt-px mc:text-[clamp(7px,1.8cqw,10px)] mc:leading-none mc:font-bold mc:text-foreground mc:shadow-sm'>
                    {item.count}
                </span>
            )}
            {left !== null && (
                <span className='mc:absolute mc:inset-x-1 mc:bottom-0.5 mc:h-0.5 mc:bg-black' aria-hidden>
                    <span className='mc:block mc:h-full' style={{ width: `${Math.round(left * 100)}%`, backgroundColor: `hsl(${Math.round(left * 120)} 100% 45%)` }} />
                </span>
            )}
        </div>
    );

    const tooltip = (
        <Tooltip content={<ItemDetails item={item} manageable={actions !== undefined} />} delay={150}>
            {tile}
        </Tooltip>
    );

    if (!actions) return tooltip;

    return (
        <ContextDropdownMenu
            items={
                <DropdownMenuItem icon={Trash2} danger onClick={() => actions.onRemove(slot, item)}>
                    Remove {item.count > 1 ? `the ${item.count}` : 'it'}
                </DropdownMenuItem>
            }
        >
            {tooltip}
        </ContextDropdownMenu>
    );
}

function ItemDetails({ item, manageable }: { item: Item; manageable: boolean }) {
    const max = maxDurability(item);

    return (
        <div className='mc:flex mc:max-w-64 mc:flex-col mc:gap-0.5 mc:text-xs'>
            <span className={cn('mc:font-semibold', item.name && 'mc:italic')}>{item.name ?? displayName(item.id)}</span>
            {item.name && <span className='mc:opacity-70'>{displayName(item.id)}</span>}
            {item.enchantments.map((enchantment) => (
                <span key={enchantment.id} className='mc:text-[#a8a8ff]'>
                    {displayName(enchantment.id)} {level(enchantment.level)}
                </span>
            ))}
            {item.unbreakable && <span>Unbreakable</span>}
            {max !== null && item.damage !== null && item.damage > 0 && (
                <span>
                    Durability: {max - item.damage} / {max}
                </span>
            )}
            <span className='mc:font-mono mc:opacity-60'>
                {item.count} × {item.id}
            </span>
            {manageable && <span className='mc:opacity-60'>Drag to move · right-click to remove</span>}
        </div>
    );
}
