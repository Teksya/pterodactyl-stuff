import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Spinner, cn, fromNow, httpErrorToHuman, toast, useCurrentServerUuid, useServerPermission } from '@pterodactyl/sdk';
import { keys, profile as fetchProfile } from '../api';
import RconRequired from '../RconRequired';
import { Head } from '../textures';
import type { Profile, Slot } from '../types';
import InventoryPanel, { EnderChestPanel, type SlotActions } from './InventoryPanel';
import ItemPicker from './ItemPicker';
import { displayName, effectTime, level, playTime } from './items';
import PlayerActions from './PlayerActions';
import Section, { ReadField } from './Section';
import StatsView from './StatsView';
import { usePlayerAction } from './usePlayerAction';
import { Hearts, Hunger } from './Vitals';

const DIMENSIONS: Record<string, string> = {
    'minecraft:overworld': 'Overworld',
    'minecraft:the_nether': 'The Nether',
    'minecraft:the_end': 'The End',
};

const GAME_MODES: Record<string, string> = { survival: 'Survival', creative: 'Creative', adventure: 'Adventure', spectator: 'Spectator' };

interface Props {
    uuid: string;
    /** Names of the players online, to teleport to. */
    online: string[];
    /** Opens the dialog that turns RCON on; absent when the user may not. */
    onTurnOnRcon?: () => void;
}

/**
 * One player, laid out as the Pelican plugin's player page: identity, statistics, status,
 * inventory, ender chest and management, each in its own section.
 */
export default function PlayerDetail({ uuid: player, online, onTurnOnRcon }: Props) {
    const uuid = useCurrentServerUuid() ?? '';
    const [manual, setManual] = useState(false);
    // While they play, an online player is read over RCON and followed on their own; while the server
    // runs, the page also looks again for them joining, leaving or RCON coming up.
    const query = useQuery({
        queryKey: keys.player(uuid, player),
        queryFn: () => fetchProfile(uuid, player),
        retry: false,
        refetchInterval: (current) => {
            const data = current.state.data;
            if (data?.source === 'live') return LIVE_REFRESH;

            return data && data.state !== 'offline' ? WATCH_REFRESH : false;
        },
    });

    if (query.isPending) return <Spinner size='large' centered />;
    // A reading that fails while the page follows the player keeps the last one on screen.
    if (!query.data) return <Alert type='danger'>{httpErrorToHuman(query.error)}</Alert>;

    const refresh = () => {
        setManual(true);
        void query.refetch().finally(() => setManual(false));
    };

    return <Loaded profile={query.data} online={online} onTurnOnRcon={onTurnOnRcon} refreshing={manual} onRefresh={refresh} />;
}

/** How often an online player is read again over RCON, and how often a running server is looked at again. */
export const LIVE_REFRESH = 3_000;
export const WATCH_REFRESH = 10_000;

function Loaded({ profile, online, onTurnOnRcon, refreshing, onRefresh }: { profile: Profile; online: string[]; onTurnOnRcon?: () => void; refreshing: boolean; onRefresh: () => void }) {
    const canManage = useServerPermission('ext.minecraft.manage');
    const action = usePlayerAction(profile.uuid);
    const [picking, setPicking] = useState<{ slot: Slot | null } | null>(null);
    const [allStats, setAllStats] = useState(false);
    // Items change by command while RCON shows them live, in the file while the server is stopped or
    // RCON says the player is offline. A last save while nobody can say whether they play is only
    // shown: the server may hold the player and write over it.
    const live = profile.source === 'live';
    const inFile = profile.source === 'file' && profile.saved && (profile.state === 'offline' || (profile.state === 'running' && profile.online === false));

    const slotActions: SlotActions | undefined =
        canManage && (live || inFile)
            ? {
                  onMove: (from, to, occupied) => {
                      if (occupied && live) {
                          toast.error('While the player is online, items move to empty slots only.');

                          return;
                      }
                      action.mutate({ action: 'move', from, to });
                  },
                  onRemove: (slot) => action.mutate({ action: 'remove_slot', slot }),
                  onPick: (slot) => setPicking({ slot }),
              }
            : undefined;
    const name = profile.name ?? 'Unknown player';
    const stats = profile.stats;
    const walked = stats?.distances.find((distance) => distance.id === 'walk')?.blocks ?? 0;
    const refresh = (
        <Button.Text size='small' onClick={onRefresh} disabled={refreshing}>
            <RefreshCw aria-hidden className={cn('mc:mr-1 mc:size-3.5', refreshing && 'mc:animate-spin')} />
            Refresh
        </Button.Text>
    );

    return (
        <div className='mc:flex mc:min-w-0 mc:flex-col mc:gap-4'>
            <Section title='Identity' aside={refresh}>
                <div className='mc:flex mc:items-start mc:gap-4'>
                    <Head uuid={profile.uuid} name={profile.name} size={64} className='mc:hidden mc:sm:block' />
                    <div className='mc:flex mc:min-w-0 mc:flex-1 mc:flex-col mc:gap-3'>
                        <div className='mc:grid mc:gap-3 mc:md:grid-cols-3'>
                            <ReadField label='Username'>{name}</ReadField>
                            <ReadField label='Current Status'>{profile.online === null ? 'Unknown' : profile.online ? 'Online' : 'Offline'}</ReadField>
                            <ReadField label='UUID' mono>
                                {profile.uuid}
                            </ReadField>
                        </div>
                        <div className='mc:flex mc:flex-wrap mc:items-center mc:gap-1.5 mc:text-xs'>
                            {profile.op !== null && (
                                <Badge size='sm' variant='soft' tone='warning'>
                                    OP {profile.op}
                                </Badge>
                            )}
                            {profile.whitelisted && (
                                <Badge size='sm' variant='soft' tone='info'>
                                    Whitelisted
                                </Badge>
                            )}
                            {profile.banned !== null && (
                                <Badge size='sm' variant='soft' tone='danger' title={profile.banned || undefined}>
                                    Banned{profile.banned ? `: ${profile.banned}` : ''}
                                </Badge>
                            )}
                            {profile.name && (
                                <>
                                    <a href={`https://namemc.com/profile/${encodeURIComponent(profile.name)}`} target='_blank' rel='noreferrer noopener' className='mc:ml-1 mc:flex mc:items-center mc:gap-1'>
                                        Profile <ExternalLink aria-hidden className='mc:size-3' />
                                    </a>
                                    <a href={`https://mc-heads.net/skin/${encodeURIComponent(profile.name)}`} target='_blank' rel='noreferrer noopener' className='mc:flex mc:items-center mc:gap-1'>
                                        Skin <ExternalLink aria-hidden className='mc:size-3' />
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </Section>

            <Section title='Statistics' description='Historical data from world stats'>
                <div className='mc:grid mc:gap-3 mc:sm:grid-cols-2 mc:lg:grid-cols-4'>
                    <ReadField label='Play Time'>{stats ? playTime(stats.playTime) : null}</ReadField>
                    <ReadField label='Distance Walked'>{stats ? `${walked.toLocaleString()} m` : null}</ReadField>
                    <ReadField label='Mobs Killed'>{stats ? stats.mobKills.toLocaleString() : null}</ReadField>
                    <ReadField label='Deaths'>{stats ? stats.deaths.toLocaleString() : null}</ReadField>
                </div>
                {stats && (
                    <div className='mc:mt-3'>
                        <Button.Text size='small' aria-expanded={allStats} onClick={() => setAllStats(!allStats)}>
                            {allStats ? 'Hide the other statistics' : 'All statistics'}
                        </Button.Text>
                        {allStats && (
                            <div className='mc:mt-3'>
                                <StatsView stats={stats} />
                            </div>
                        )}
                    </div>
                )}
            </Section>

            {profile.state === 'running' && profile.rcon.state !== 'ok' && (
                <RconRequired rcon={profile.rcon} onSettings={onTurnOnRcon}>
                    Whether {name} is online, and what they hold while they play, is asked over RCON{profile.saved ? ': below is their last save.' : '.'}
                </RconRequired>
            )}

            {profile.source === 'none' ? (
                <Alert type='warning'>
                    RCON did not read {name}: {profile.liveError}
                </Alert>
            ) : !profile.saved ? (
                <Alert type={profile.readError ? 'warning' : 'info'}>
                    {profile.readError ??
                        (profile.online
                            ? 'The server has not saved this player yet. They show here once it does.'
                            : profile.online === false
                              ? 'This player has no file in this world: they never played on it (an entry of the whitelist, operators or bans can carry another UUID than the one the server gave them).'
                              : 'This player has no file in this world yet: they never played on it, or the server has not saved them since they first joined.')}
                </Alert>
            ) : (
                <>
                    {(profile.unread ?? []).length > 0 && (
                        <Alert type='warning'>
                            <div className='mc:flex mc:flex-col mc:gap-1'>
                                <span className='mc:font-medium'>Part of what RCON answered about {name} could not be read, and is missing here:</span>
                                {profile.unread!.map(({ field, reason }) => (
                                    <span key={field}>
                                        <code>{field}</code>: {reason}
                                    </span>
                                ))}
                            </div>
                        </Alert>
                    )}
                    <Section title='Status' description={<StatusSource profile={profile} />} collapsible>
                        <Vitals profile={profile} />
                    </Section>

                    <Section title='Inventory' collapsible>
                        <InventoryPanel profile={profile} actions={slotActions} />
                        {inFile && canManage && <p className='mc:mt-3 mc:mb-0 mc:text-center mc:text-xs mc:text-muted-foreground'>Changes are written to their file and apply when they join.</p>}
                    </Section>

                    <Section title='Ender Chest' collapsible>
                        <EnderChestPanel items={profile.enderItems ?? []} actions={slotActions} />
                    </Section>
                </>
            )}

            {canManage && (
                <Section title='Management' description='Perform actions on this player' collapsible>
                    <PlayerActions player={profile} others={online.filter((other) => other !== profile.name)} onGive={() => setPicking({ slot: null })} />
                </Section>
            )}

            <ItemPicker
                key={picking ? `pick-${picking.slot}` : 'closed'}
                open={picking !== null}
                title={picking?.slot ? `Give ${name} an item in this slot` : `Give ${name} an item`}
                version={profile.version}
                // A slot holds one stack, and so does a file; /give spreads over several slots.
                maxCount={picking?.slot || inFile ? 64 : 6400}
                pending={action.isPending}
                onClose={() => setPicking(null)}
                onPick={(id, count) =>
                    action.mutate(
                        { action: 'give', item: id, count, slot: picking?.slot ?? undefined },
                        { onSuccess: () => setPicking(null) }
                    )
                }
            />
        </div>
    );
}

/** Where the status comes from, in the plugin's words, and when a save was written. */
function StatusSource({ profile }: { profile: Profile }) {
    if (profile.source === 'live') return <>Real-time data from server · updates every {LIVE_REFRESH / 1000} seconds</>;
    // The server writes the file every few minutes and when the player leaves.
    const save = `Displaying data from last save file${profile.lastSeen ? `, saved ${fromNow(profile.lastSeen)}` : ''}`;
    if (profile.online) return <>Before Minecraft 1.13 the server cannot be asked about a player - {save}</>;
    if (profile.online === false) return <>Offline - {save}</>;
    // Nobody can say whether they play: RCON is off or did not answer (or named someone the panel could
    // not read), or the server starts or stops.
    if (profile.state === 'running') return <>Online or not, unknown{profile.rcon.state === 'ok' ? '' : ' without RCON'} - {save}, behind if they are playing</>;

    return <>{profile.state ? `The server is ${profile.state}` : 'Wings did not say whether the server runs'} - {save}</>;
}

/** Health and food as the game draws them, then the player's level, game mode and place. */
function Vitals({ profile }: { profile: Profile }) {
    const position = profile.position;

    return (
        <div className='mc:flex mc:flex-col mc:gap-4'>
            <div className='mc:grid mc:grid-cols-[auto_1fr_auto] mc:items-center mc:gap-x-3 mc:gap-y-2'>
                <VitalRow label='Health' value={profile.health}>
                    {profile.health != null ? <Hearts health={profile.health} max={profile.maxHealth ?? 20} /> : null}
                </VitalRow>
                <VitalRow label='Food' value={profile.food}>
                    {profile.food != null ? <Hunger food={profile.food} /> : null}
                </VitalRow>
            </div>
            <div className='mc:grid mc:gap-3 mc:sm:grid-cols-2 mc:lg:grid-cols-4'>
                <ReadField label='XP Level'>{profile.xpLevel ?? null}</ReadField>
                <ReadField label='Gamemode'>{profile.gamemode ? GAME_MODES[profile.gamemode] : null}</ReadField>
                <ReadField label='Dimension'>{profile.dimension ? (DIMENSIONS[profile.dimension] ?? displayName(profile.dimension)) : null}</ReadField>
                <ReadField label='Position'>{position ? `${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}` : null}</ReadField>
            </div>
            {(profile.effects ?? []).length > 0 && (
                <div className='mc:flex mc:flex-wrap mc:gap-1.5'>
                    {profile.effects!.map((effect) => (
                        <Badge key={effect.id} size='sm' variant='soft' tone='accent'>
                            <Sparkles aria-hidden className='mc:mr-1 mc:size-3' />
                            {displayName(effect.id)} {level(effect.amplifier + 1)} · {effectTime(effect.duration)}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}

function VitalRow({ label, value, children }: { label: string; value: number | null | undefined; children: ReactNode }) {
    return (
        <>
            <span className='mc:w-16 mc:text-sm mc:font-bold mc:text-muted-foreground mc:select-none'>{label}</span>
            <div>{children ?? '—'}</div>
            <span className='mc:font-mono mc:text-sm mc:text-muted-foreground'>{value != null ? `(${Math.round(value * 10) / 10})` : ''}</span>
        </>
    );
}
