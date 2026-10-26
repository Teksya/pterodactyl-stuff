import { useState, type ReactNode } from 'react';
import { Ban, CheckCircle, Eraser, ListChecks, LogOut, MoreHorizontal, ShieldAlert, ShieldCheck, Skull, Sparkles, Star, Trash2 } from 'lucide-react';
import { Button, Dialog, DropdownMenu, DropdownMenuItem, Input, Label, NumberInput, Select, Tooltip } from '@pterodactyl/sdk';
import type { PlayerAction } from '../api';
import type { GameMode, Player, Profile } from '../types';
import { usePlayerAction } from './usePlayerAction';

const GAME_MODES: { value: GameMode; label: string }[] = [
    { value: 'survival', label: 'Survival' },
    { value: 'creative', label: 'Creative' },
    { value: 'adventure', label: 'Adventure' },
    { value: 'spectator', label: 'Spectator' },
];

const EFFECTS = [
    'speed', 'haste', 'strength', 'jump_boost', 'regeneration', 'resistance', 'fire_resistance', 'water_breathing',
    'invisibility', 'night_vision', 'health_boost', 'absorption', 'saturation', 'glowing', 'levitation', 'slow_falling',
    'conduit_power', 'dolphins_grace', 'luck', 'slowness', 'mining_fatigue', 'nausea', 'blindness', 'hunger', 'weakness',
    'poison', 'wither', 'darkness',
].map((id) => ({ value: `minecraft:${id}`, label: id.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) }));

const DIMENSIONS = [
    { value: '', label: 'The one they are in' },
    { value: 'minecraft:overworld', label: 'Overworld' },
    { value: 'minecraft:the_nether', label: 'The Nether' },
    { value: 'minecraft:the_end', label: 'The End' },
];

type DialogName = 'message' | 'teleport' | 'effect' | 'xp' | 'kick' | 'ban' | 'pardon' | 'op' | 'clear' | 'kill';

interface Props {
    player: Profile;
    /** Names of the other players online, to teleport to. */
    others: string[];
    onGive: () => void;
}

const smallButton = 'mc:inline-flex mc:h-8 mc:cursor-pointer mc:items-center mc:gap-1.5 mc:rounded-md mc:border mc:border-border mc:bg-transparent mc:px-3 mc:text-sm mc:text-foreground mc:hover:bg-secondary mc:disabled:cursor-default mc:disabled:opacity-50';

/** The plugin's reasons, prefilled. */
export const KICK_REASON = 'Kicked by operator';
export const BAN_REASON = 'Banned by Operator';

/**
 * The Management section: the Pelican plugin's four actions (OP, clear the inventory, kick, ban),
 * then the panel's others. Online, each one is a console command; offline, the ones that change
 * the player (game mode, health, food, place, items, effects, levels) edit their saved file.
 */
export default function PlayerActions({ player, others, onGive }: Props) {
    const action = usePlayerAction(player.uuid);
    const [dialog, setDialog] = useState<DialogName | null>(null);
    const run = (input: PlayerAction) => action.mutateAsync(input).then(() => setDialog(null), () => {});
    const online = player.online;
    const offlineReason = `${player.name ?? 'The player'} is offline.`;
    const editable = online || player.saved;
    const isOp = player.op !== null;

    const onlineOnly = (button: ReactNode) => (online ? button : <Tooltip content={offlineReason}>{<span className='mc:inline-flex'>{button}</span>}</Tooltip>);

    return (
        <div className='mc:flex mc:flex-col mc:gap-4'>
            <div className='mc:flex mc:flex-wrap mc:gap-3'>
                <Button size='small' color={isOp ? 'red' : 'green'} onClick={() => setDialog('op')}>
                    {isOp ? <ShieldAlert aria-hidden className='mc:mr-1.5 mc:size-4' /> : <ShieldCheck aria-hidden className='mc:mr-1.5 mc:size-4' />}
                    {isOp ? 'DEOP' : 'OP'}
                </Button>
                <Button size='small' color='red' disabled={!editable} onClick={() => setDialog('clear')}>
                    <Trash2 aria-hidden className='mc:mr-1.5 mc:size-4' />
                    Clear Inv
                </Button>
                {onlineOnly(
                    <Button size='small' color='red' disabled={!online} onClick={() => setDialog('kick')}>
                        <LogOut aria-hidden className='mc:mr-1.5 mc:size-4' />
                        Kick
                    </Button>
                )}
                {player.banned !== null ? (
                    <Button size='small' color='green' onClick={() => setDialog('pardon')}>
                        <CheckCircle aria-hidden className='mc:mr-1.5 mc:size-4' />
                        Unban
                    </Button>
                ) : (
                    <Button size='small' color='red' onClick={() => setDialog('ban')}>
                        <Ban aria-hidden className='mc:mr-1.5 mc:size-4' />
                        Ban
                    </Button>
                )}
            </div>

            <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-1.5'>
                {onlineOnly(
                    <button type='button' className={smallButton} disabled={!online} onClick={() => setDialog('message')}>
                        Message
                    </button>
                )}
                <button type='button' className={smallButton} disabled={!editable} onClick={() => setDialog('teleport')}>
                    Teleport
                </button>
                <DropdownMenu triggerClassName={smallButton} triggerContent={<>{GAME_MODES.find((mode) => mode.value === player.gamemode)?.label ?? 'Game mode'}</>}>
                    {GAME_MODES.map((mode) => (
                        <DropdownMenuItem key={mode.value} checked={mode.value === player.gamemode} disabled={!editable} onClick={() => void run({ action: 'gamemode', mode: mode.value })}>
                            {mode.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenu>
                <DropdownMenu triggerClassName={smallButton} triggerContent='Effects'>
                    <DropdownMenuItem icon={Sparkles} disabled={!online} onClick={() => setDialog('effect')}>
                        Give an effect…{!online && ' (online)'}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={Eraser} disabled={!editable} onClick={() => void run({ action: 'effect_clear' })}>
                        Clear the effects
                    </DropdownMenuItem>
                </DropdownMenu>
                <button type='button' className={smallButton} disabled={!editable || action.isPending} onClick={() => void run({ action: 'heal' })}>
                    Heal
                </button>
                <button type='button' className={smallButton} disabled={!editable || action.isPending} onClick={() => void run({ action: 'feed' })}>
                    Feed
                </button>
                <button type='button' className={smallButton} disabled={!editable} onClick={onGive}>
                    Give item
                </button>
                <DropdownMenu
                    triggerClassName={smallButton}
                    triggerContent={
                        <>
                            More
                            <MoreHorizontal aria-hidden className='mc:size-4' />
                        </>
                    }
                >
                    <DropdownMenuItem icon={Star} disabled={!editable} onClick={() => setDialog('xp')}>
                        Add experience…
                    </DropdownMenuItem>
                    {player.whitelisted ? (
                        <DropdownMenuItem icon={ListChecks} onClick={() => void run({ action: 'whitelist_remove' })}>
                            Remove from the whitelist
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem icon={ListChecks} onClick={() => void run({ action: 'whitelist_add' })}>
                            Add to the whitelist
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem icon={Skull} danger disabled={!online} onClick={() => setDialog('kill')}>
                        Kill…
                    </DropdownMenuItem>
                </DropdownMenu>
            </div>

            <OpDialog open={dialog === 'op'} player={player} pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: isOp ? 'deop' : 'op' })} />
            <TextDialog key={`message-${dialog === 'message'}`} open={dialog === 'message'} title={`Message ${player.name}`} label='Message' confirm='Send' required titleOption pending={action.isPending} onClose={() => setDialog(null)} onRun={(text, asTitle) => run({ action: asTitle ? 'title' : 'message', text })} />
            <TextDialog key={`kick-${dialog === 'kick'}`} open={dialog === 'kick'} title={`Kick ${player.name}`} label='Reason' initial={KICK_REASON} confirm='Kick' pending={action.isPending} onClose={() => setDialog(null)} onRun={(reason) => run({ action: 'kick', reason })} />
            <TextDialog key={`ban-${dialog === 'ban'}`} open={dialog === 'ban'} title={`Ban ${player.name}`} label='Reason' initial={BAN_REASON} confirm='Ban' pending={action.isPending} onClose={() => setDialog(null)} onRun={(reason) => run({ action: 'ban', reason })} />
            <TeleportDialog key={`teleport-${dialog === 'teleport'}`} open={dialog === 'teleport'} player={player} others={others} pending={action.isPending} onClose={() => setDialog(null)} onRun={run} />
            <EffectDialog key={`effect-${dialog === 'effect'}`} open={dialog === 'effect'} name={player.name ?? ''} pending={action.isPending} onClose={() => setDialog(null)} onRun={run} />
            <XpDialog key={`xp-${dialog === 'xp'}`} open={dialog === 'xp'} player={player} pending={action.isPending} onClose={() => setDialog(null)} onRun={run} />
            <Dialog.Confirm open={dialog === 'pardon'} title={`Unban ${player.name}?`} confirm='Unban' pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: 'pardon' })}>
                They can join the server again.
            </Dialog.Confirm>
            <Dialog.Confirm open={dialog === 'clear'} title={`Clear ${player.name}'s inventory?`} confirm='Clear' pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: 'clear' })}>
                Are you sure you want to clear this player&apos;s inventory? This cannot be undone. Their armour goes too; their ender chest stays.
            </Dialog.Confirm>
            <Dialog.Confirm open={dialog === 'kill'} title={`Kill ${player.name}?`} confirm='Kill' pending={action.isPending} onClose={() => setDialog(null)} onConfirmed={() => void run({ action: 'kill' })}>
                They drop their items where they stand, unless keepInventory is on.
            </Dialog.Confirm>
        </div>
    );
}

/** Granting or revoking operator, with the plugin's wording. */
export function OpDialog({ open, player, pending, onClose, onConfirmed }: { open: boolean; player: Player; pending: boolean; onClose: () => void; onConfirmed: () => void }) {
    const isOp = player.op !== null;

    return (
        <Dialog.Confirm open={open} title={isOp ? 'Revoke Operator Status' : 'Grant Operator Status'} confirm={isOp ? 'DEOP' : 'OP'} pending={pending} onClose={onClose} onConfirmed={onConfirmed}>
            {isOp ? `Are you sure you want to remove OP privileges from ${player.name ?? 'this player'}?` : `Are you sure you want to make ${player.name ?? 'this player'} an Operator (OP)?`}
        </Dialog.Confirm>
    );
}

function Form({ open, title, pending, confirm = 'Apply', disabled, onClose, onSubmit, children }: { open: boolean; title: string; pending: boolean; confirm?: string; disabled?: boolean; onClose: () => void; onSubmit: () => void; children: ReactNode }) {
    return (
        <Dialog open={open} onClose={onClose} title={title}>
            <form
                id='mc-action-form'
                className='mc:flex mc:flex-col mc:gap-4'
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!disabled) onSubmit();
                }}
            >
                {children}
            </form>
            <Dialog.Footer>
                <Button isSecondary onClick={onClose}>
                    Cancel
                </Button>
                <Button type='submit' form='mc-action-form' isLoading={pending} disabled={disabled}>
                    {confirm}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

interface DialogProps {
    open: boolean;
    pending: boolean;
    onClose: () => void;
    onRun: (action: PlayerAction) => Promise<void>;
}

function TeleportDialog({ open, player, others, pending, onClose, onRun }: DialogProps & { player: Profile; others: string[] }) {
    const [to, setTo] = useState('');
    const [coordinates, setCoordinates] = useState(() => ({ x: player.position ? Math.floor(player.position.x) : null, y: player.position ? Math.floor(player.position.y) : null, z: player.position ? Math.floor(player.position.z) : null }));
    const [dimension, setDimension] = useState('');
    const byCoordinates = to === '';
    const complete = !byCoordinates || (coordinates.x !== null && coordinates.y !== null && coordinates.z !== null);

    return (
        <Form
            open={open}
            title={`Teleport ${player.name}`}
            confirm='Teleport'
            pending={pending}
            disabled={!complete}
            onClose={onClose}
            onSubmit={() => void onRun(byCoordinates ? { action: 'teleport', x: coordinates.x!, y: coordinates.y!, z: coordinates.z!, dimension: dimension || undefined } : { action: 'teleport', to })}
        >
            {player.online && others.length > 0 && (
                <div>
                    <Label htmlFor='mc-teleport-to'>To</Label>
                    <Select id='mc-teleport-to' value={to} onChange={(value) => setTo(String(value))} options={[{ value: '', label: 'Coordinates' }, ...others.map((other) => ({ value: other, label: other }))]} />
                </div>
            )}
            {byCoordinates && (
                <>
                    <div className='mc:grid mc:grid-cols-3 mc:gap-3'>
                        {(['x', 'y', 'z'] as const).map((axis) => (
                            <div key={axis}>
                                <Label htmlFor={`mc-teleport-${axis}`}>{axis.toUpperCase()}</Label>
                                <NumberInput id={`mc-teleport-${axis}`} value={coordinates[axis]} onValueChange={(value) => setCoordinates({ ...coordinates, [axis]: value })} />
                            </div>
                        ))}
                    </div>
                    <div>
                        <Label htmlFor='mc-teleport-dimension'>Dimension</Label>
                        <Select id='mc-teleport-dimension' value={dimension} onChange={(value) => setDimension(String(value))} options={DIMENSIONS} />
                    </div>
                </>
            )}
        </Form>
    );
}

function EffectDialog({ open, name, pending, onClose, onRun }: DialogProps & { name: string }) {
    const [effect, setEffect] = useState(EFFECTS[0].value);
    const [seconds, setSeconds] = useState<number | null>(60);
    const [amplifier, setAmplifier] = useState<number | null>(1);

    return (
        <Form open={open} title={`Give ${name} an effect`} confirm='Give' pending={pending} disabled={!seconds || !amplifier} onClose={onClose} onSubmit={() => void onRun({ action: 'effect', effect, seconds: seconds ?? 60, amplifier: (amplifier ?? 1) - 1 })}>
            <div>
                <Label htmlFor='mc-effect'>Effect</Label>
                <Select id='mc-effect' value={effect} onChange={(value) => setEffect(String(value))} options={EFFECTS} />
            </div>
            <div className='mc:grid mc:grid-cols-2 mc:gap-3'>
                <div>
                    <Label htmlFor='mc-effect-seconds'>Seconds</Label>
                    <NumberInput id='mc-effect-seconds' value={seconds} min={1} max={1000000} onValueChange={setSeconds} />
                </div>
                <div>
                    <Label htmlFor='mc-effect-level'>Level</Label>
                    <NumberInput id='mc-effect-level' value={amplifier} min={1} max={256} onValueChange={setAmplifier} />
                </div>
            </div>
        </Form>
    );
}

function XpDialog({ open, player, pending, onClose, onRun }: DialogProps & { player: Profile }) {
    const [amount, setAmount] = useState<number | null>(5);
    const [unit, setUnit] = useState<'levels' | 'points'>('levels');

    return (
        <Form open={open} title={`Experience for ${player.name}`} confirm='Add' pending={pending} disabled={!amount} onClose={onClose} onSubmit={() => void onRun({ action: 'xp', amount: amount ?? 0, unit })}>
            <div className='mc:grid mc:grid-cols-2 mc:gap-3'>
                <div>
                    <Label htmlFor='mc-xp-amount'>Amount</Label>
                    <NumberInput id='mc-xp-amount' value={amount} min={-100000} max={100000} onValueChange={setAmount} />
                    <p className='mc:mt-1 mc:text-xs mc:text-muted-foreground'>Below zero takes it away.</p>
                </div>
                {player.online && (
                    <div>
                        <Label htmlFor='mc-xp-unit'>Of</Label>
                        <Select id='mc-xp-unit' value={unit} onChange={(value) => setUnit(value as 'levels' | 'points')} options={[{ value: 'levels', label: 'Levels' }, { value: 'points', label: 'Points' }]} />
                    </div>
                )}
            </div>
        </Form>
    );
}

interface TextDialogProps {
    open: boolean;
    title: string;
    label: string;
    /** The text the field starts with. */
    initial?: string;
    confirm: string;
    required?: boolean;
    titleOption?: boolean;
    pending: boolean;
    onClose: () => void;
    onRun: (text: string, asTitle: boolean) => Promise<void>;
}

export function TextDialog({ open, title, label, initial = '', confirm, required, titleOption, pending, onClose, onRun }: TextDialogProps) {
    const [text, setText] = useState(initial);
    const [asTitle, setAsTitle] = useState(false);

    return (
        <Form open={open} title={title} confirm={confirm} pending={pending} disabled={required === true && text.trim() === ''} onClose={onClose} onSubmit={() => void onRun(text.trim(), asTitle)}>
            <div>
                <Label htmlFor='mc-text'>{label}</Label>
                <Input id='mc-text' value={text} maxLength={256} onChange={(event) => setText(event.currentTarget.value)} />
            </div>
            {titleOption && (
                <div>
                    <Label htmlFor='mc-text-kind'>Show it</Label>
                    <Select
                        id='mc-text-kind'
                        value={asTitle ? 'title' : 'chat'}
                        onChange={(value) => setAsTitle(value === 'title')}
                        options={[{ value: 'chat', label: 'In their chat, privately' }, { value: 'title', label: 'As a title across their screen' }]}
                    />
                </div>
            )}
        </Form>
    );
}
