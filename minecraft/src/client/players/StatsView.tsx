import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@pterodactyl/sdk';
import { ItemIcon } from '../textures';
import type { Ranked, Stats } from '../types';
import { displayName, playTime } from './items';

const DISTANCES: Record<string, string> = {
    walk: 'Walked',
    sprint: 'Sprinted',
    crouch: 'Crouched',
    swim: 'Swum',
    walk_on_water: 'Walked on water',
    walk_under_water: 'Walked under water',
    fly: 'Flown',
    aviate: 'Flown with elytra',
    climb: 'Climbed',
    fall: 'Fallen',
    boat: 'By boat',
    horse: 'On horseback',
    minecart: 'By minecart',
    pig: 'On a pig',
    strider: 'On a strider',
};

/** The counters the server keeps for a player: time, kills, distances, what they mined and killed. */
export default function StatsView({ stats }: { stats: Stats | null }) {
    if (!stats) {
        return (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant='icon'>
                        <BarChart3 />
                    </EmptyMedia>
                    <EmptyTitle>No statistics yet</EmptyTitle>
                    <EmptyDescription>The server writes a player's statistics when they leave and at each save.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    const tiles: [string, string][] = [
        ['Play time', playTime(stats.playTime)],
        ['Deaths', stats.deaths.toLocaleString()],
        ['Mob kills', stats.mobKills.toLocaleString()],
        ['Player kills', stats.playerKills.toLocaleString()],
        ['Blocks mined', stats.blocksMined.toLocaleString()],
        ['Items crafted', stats.itemsCrafted.toLocaleString()],
        ['Jumps', stats.jumps.toLocaleString()],
        ['Damage dealt', `${Math.round(stats.damageDealt / 10).toLocaleString()} HP`],
        ['Damage taken', `${Math.round(stats.damageTaken / 10).toLocaleString()} HP`],
        ['Times joined', stats.timesJoined.toLocaleString()],
    ];
    const farthest = stats.distances[0]?.blocks ?? 0;

    return (
        <div className='mc:flex mc:flex-col mc:gap-6'>
            <dl className='mc:m-0 mc:grid mc:grid-cols-2 mc:gap-2 mc:sm:grid-cols-3 mc:xl:grid-cols-5'>
                {tiles.map(([label, value]) => (
                    <div key={label} className='mc:rounded-md mc:border mc:border-border mc:bg-card mc:px-3 mc:py-2'>
                        <dt className='mc:text-xs mc:text-muted-foreground'>{label}</dt>
                        <dd className='mc:m-0 mc:text-lg mc:font-semibold mc:tabular-nums'>{value}</dd>
                    </div>
                ))}
            </dl>

            {stats.distances.length > 0 && (
                <Section title='Distance travelled (blocks)'>
                    {stats.distances.map((distance) => (
                        <Bar key={distance.id} label={DISTANCES[distance.id] ?? displayName(distance.id)} value={distance.blocks} max={farthest} />
                    ))}
                </Section>
            )}

            <div className='mc:grid mc:gap-6 mc:lg:grid-cols-2'>
                <Ranking title='Most mined' rows={stats.mined} withIcons />
                <Ranking title='Mobs killed' rows={stats.killed} />
            </div>
            {stats.killedBy.length > 0 && <Ranking title='Killed by' rows={stats.killedBy} />}
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className='mc:mt-0 mc:mb-2 mc:text-xs mc:font-medium mc:tracking-wide mc:text-muted-foreground mc:uppercase'>{title}</h3>
            <div className='mc:flex mc:flex-col mc:gap-2'>{children}</div>
        </section>
    );
}

function Ranking({ title, rows, withIcons }: { title: string; rows: Ranked[]; withIcons?: boolean }) {
    if (rows.length === 0) return null;
    const top = rows[0].count;

    return (
        <Section title={title}>
            {rows.map((row) => (
                <Bar key={row.id} label={displayName(row.id)} value={row.count} max={top} icon={withIcons ? <ItemIcon id={`minecraft:${row.id}`} /> : undefined} />
            ))}
        </Section>
    );
}

function Bar({ label, value, max, icon }: { label: string; value: number; max: number; icon?: ReactNode }) {
    return (
        <div className='mc:flex mc:items-center mc:gap-2'>
            {icon && <span className='mc:flex mc:size-5 mc:shrink-0 mc:items-center mc:justify-center'>{icon}</span>}
            <div className='mc:min-w-0 mc:flex-1'>
                <div className='mc:flex mc:justify-between mc:gap-2 mc:text-sm'>
                    <span className='mc:truncate'>{label}</span>
                    <span className='mc:tabular-nums mc:text-muted-foreground'>{value.toLocaleString()}</span>
                </div>
                <div className='mc:mt-1 mc:h-1 mc:rounded-full mc:bg-muted' aria-hidden>
                    <div className='mc:h-full mc:rounded-full mc:bg-primary' style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
                </div>
            </div>
        </div>
    );
}
