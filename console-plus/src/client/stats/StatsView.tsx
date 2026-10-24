import { useMemo } from 'react';
import { Clock, CloudDownload, CloudUpload, Cpu, HardDrive, MemoryStick, Wifi } from 'lucide-react';
import { cn, CopyOnClick, Stat, useCurrentServer } from '@pterodactyl/sdk';
import type { ServerRunState, ServerStatMetric, UiTone, ViewProps } from '@pterodactyl/sdk/theme';
import { usePreferences } from '../preferences';
import { bytesRate, shortBytes } from './format';
import { rates, useStatsHistory } from './history';

const tile = 'cx:col-span-3 cx:md:col-span-2 cx:lg:col-span-6';

/** "1d 2h 3m", or "2h 3m 4s" under a day. */
function duration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds % 60}s`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const capitalize = (state: string) => state.charAt(0).toUpperCase() + state.slice(1);

function uptimeTone(state: ServerRunState | null): UiTone {
    if (state === 'running') return 'neutral';

    return state === 'offline' ? 'danger' : 'warning';
}

/** The share of a limit in use, for a meter; none without a limit. */
const share = (metric: ServerStatMetric) => (metric.limit > 0 ? Math.min(100, (metric.value / metric.limit) * 100) : null);

const tone = (metric: ServerStatMetric): UiTone => metric.alarm ?? 'neutral';

const rate = (value: number | null | undefined) => (value === null || value === undefined ? '—' : bytesRate(value));

/**
 * The console's cards: what the panel shows, with a meter for CPU, memory and disk against their
 * limits, the time the server started, and the network as it flows now (per second) beside its
 * totals.
 */
export default function StatsView({ model, Default, className }: ViewProps<'server.stats'>) {
    const uuid = useCurrentServer()?.attributes.uuid ?? '';
    const { preferences } = usePreferences(uuid);
    const samples = useStatsHistory(uuid);
    const flow = useMemo(() => rates(samples.slice(-2)), [samples]);

    if (preferences.view.original) return <Default className={className} />;

    const offline = model.state === 'offline';
    const address = model.address ?? 'n/a';
    const { cpu, memory, disk } = model;
    const limitOf = (text: string | null) => <>/ {text ?? <>&infin;</>}</>;

    return (
        <div className={cn('cx:grid cx:grid-cols-6 cx:gap-2 cx:md:gap-4', className)}>
            <CopyOnClick text={address}>
                <Stat icon={Wifi} label='Address' value={address} className={tile} />
            </CopyOnClick>
            <Stat
                icon={Clock}
                label='Uptime'
                value={model.state === null ? 'Offline' : model.uptime > 0 ? duration(model.uptime) : capitalize(model.state)}
                limit={model.uptime > 0 ? `since ${clock(Date.now() - model.uptime)}` : undefined}
                tone={uptimeTone(model.state)}
                className={tile}
            />
            <Stat
                icon={Cpu}
                label='CPU Load'
                value={offline ? 'Offline' : `${cpu.value.toFixed(cpu.value < 10 ? 2 : 1)}%`}
                limit={offline ? undefined : limitOf(cpu.limit ? `${cpu.limit}%` : null)}
                meter={offline ? undefined : share(cpu)}
                tone={tone(cpu)}
                unavailable={offline}
                className={tile}
            />
            <Stat
                icon={MemoryStick}
                label='Memory'
                value={offline ? 'Offline' : shortBytes(memory.value)}
                limit={offline ? undefined : limitOf(memory.limit ? shortBytes(memory.limit) : null)}
                meter={offline ? undefined : share(memory)}
                tone={tone(memory)}
                unavailable={offline}
                className={tile}
            />
            <Stat
                icon={HardDrive}
                label='Disk'
                value={shortBytes(disk.value)}
                limit={limitOf(disk.limit ? shortBytes(disk.limit) : null)}
                meter={share(disk)}
                tone={tone(disk)}
                className={tile}
            />
            <Stat
                icon={CloudDownload}
                label='Network in'
                value={offline ? 'Offline' : rate(flow.rx.at(-1))}
                limit={offline ? undefined : `${shortBytes(model.network.rx)} total`}
                unavailable={offline}
                className={tile}
            />
            <Stat
                icon={CloudUpload}
                label='Network out'
                value={offline ? 'Offline' : rate(flow.tx.at(-1))}
                limit={offline ? undefined : `${shortBytes(model.network.tx)} total`}
                unavailable={offline}
                className={tile}
            />
        </div>
    );
}
