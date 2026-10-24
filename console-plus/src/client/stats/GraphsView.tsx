import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { Button, ChartCard, cn, RowActionButton, Tooltip, useCurrentServer } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import ChoiceMenu from '../ChoiceMenu';
import { usePreferences, type Preferences } from '../preferences';
import Chart, { type Series } from './Chart';
import { bytesRate, shortBytes } from './format';
import { rates, summarize, useStatsHistory, type Summary } from './history';

const RANGES: { value: Preferences['view']['range']; label: string; ms: number }[] = [
    { value: '1m', label: '1 minute', ms: 60_000 },
    { value: '5m', label: '5 minutes', ms: 5 * 60_000 },
    { value: '15m', label: '15 minutes', ms: 15 * 60_000 },
    { value: '1h', label: '1 hour', ms: 60 * 60_000 },
];

const MIB = 1024 * 1024;

const percent = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}%`;


interface Graph {
    key: string;
    title: string;
    series: Series[];
    format: (value: number) => string;
    limit?: number;
    floor?: number;
    /** What the header sums up: the one series, or the first of several. */
    summaries: { label?: string; summary: Summary }[];
}

/**
 * The header's figures: current, average and peak for one series; for several, each one's
 * current value, with the averages and peaks on hover, so the header fits its card.
 */
function Totals({ summaries, format }: { summaries: Graph['summaries']; format: (value: number) => string }) {
    const show = (value: number | null) => (value === null ? '—' : format(value));
    const single = summaries.length === 1;
    const details = summaries.map(({ label, summary }) => `${label ? `${label}: ` : ''}avg ${show(summary.average)}, peak ${show(summary.peak)}`).join(' · ');

    const figures = (
        <span className='cx:hidden cx:max-w-[24rem] cx:min-w-0 cx:truncate cx:text-xs cx:text-muted-foreground cx:sm:block'>
            {summaries.map(({ label, summary }, index) => (
                <span key={label ?? 'value'}>
                    {index > 0 && <span className='cx:mx-1.5'>·</span>}
                    {label && <span className='cx:mr-1'>{label}</span>}
                    <span className='cx:font-medium cx:text-foreground'>{show(summary.current)}</span>
                    {single && (
                        <>
                            <span className='cx:mx-1'>·</span>avg {show(summary.average)}
                            <span className='cx:mx-1'>·</span>peak {show(summary.peak)}
                        </>
                    )}
                </span>
            ))}
        </span>
    );

    return single ? figures : <Tooltip content={details}>{figures}</Tooltip>;
}

/**
 * The console's graphs: CPU, memory, disk and network over the last minute to hour (kept in the
 * tab from the server's readings), with the current, average and peak value, the server's
 * limits, the exact value under the pointer, a pause and a larger view of one graph.
 */
export default function GraphsView({ model, Default, className }: ViewProps<'server.graphs'>) {
    const server = useCurrentServer();
    const uuid = server?.attributes.uuid ?? '';
    const { preferences, update } = usePreferences(uuid);
    const samples = useStatsHistory(uuid);
    const [now, setNow] = useState(() => Date.now());
    const [paused, setPaused] = useState<number | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const range = RANGES.find((item) => item.value === preferences.view.range) ?? RANGES[1];

    // The graphs slide with time while the server runs, unless paused.
    useEffect(() => {
        if (paused !== null || !model.live) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(timer);
    }, [paused, model.live]);

    const to = paused ?? Math.max(now, samples.at(-1)?.t ?? 0);
    const from = to - range.ms;

    const graphs = useMemo<Graph[]>(() => {
        const shown = samples.filter((sample) => sample.t >= from && sample.t <= to);
        const pick = (values: (number | null)[]) => values.filter((_, index) => samples[index].t >= from && samples[index].t <= to);
        const flow = rates(samples);
        const cpu = samples.map((sample) => sample.cpu);
        const memory = samples.map((sample) => sample.memory);
        const disk = samples.map((sample) => sample.disk);
        const diskLimit = (server?.attributes.limits.disk ?? 0) * MIB;

        return [
            {
                key: 'cpu',
                title: 'CPU Load',
                series: [{ label: 'CPU', color: 'var(--chart-1)', values: cpu }],
                format: percent,
                limit: model.cpu.limit,
                floor: 10,
                summaries: [{ summary: summarize(shown.map((sample) => sample.cpu)) }],
            },
            {
                key: 'memory',
                title: 'Memory',
                series: [{ label: 'Memory', color: 'var(--chart-1)', values: memory }],
                format: shortBytes,
                limit: model.memory.limit * MIB,
                floor: 256 * MIB,
                summaries: [{ summary: summarize(shown.map((sample) => sample.memory)) }],
            },
            {
                key: 'disk',
                title: 'Disk',
                series: [{ label: 'Disk', color: 'var(--chart-1)', values: disk }],
                format: shortBytes,
                limit: diskLimit,
                floor: 1024 * MIB,
                summaries: [{ summary: summarize(shown.map((sample) => sample.disk)) }],
            },
            {
                key: 'network',
                title: 'Network',
                series: [
                    { label: 'In', color: 'var(--chart-2)', values: flow.rx },
                    { label: 'Out', color: 'var(--chart-1)', values: flow.tx },
                ],
                format: bytesRate,
                floor: 1024,
                summaries: [
                    { label: 'In', summary: summarize(pick(flow.rx)) },
                    { label: 'Out', summary: summarize(pick(flow.tx)) },
                ],
            },
        ];
    }, [samples, from, to, model.cpu.limit, model.memory.limit, server?.attributes.limits.disk]);

    if (preferences.view.original) return <Default className={className} />;

    const times = samples.map((sample) => sample.t);
    const setRange = (value: Preferences['view']['range']) => update((current) => ({ ...current, view: { ...current.view, range: value } }));

    return (
        <div className={cn('cx:flex cx:flex-col cx:gap-2 cx:sm:gap-3', className)}>
            <div className='cx:flex cx:items-center cx:justify-end cx:gap-2'>
                <ChoiceMenu label='Range' value={range.value} options={RANGES} onChange={setRange} />
                <Button.Text type='button' size='small' onClick={() => setPaused(paused === null ? to : null)} aria-pressed={paused !== null}>
                    <span className='cx:inline-flex cx:items-center cx:gap-1.5'>
                        {paused === null ? <Pause className='cx:size-3.5' aria-hidden /> : <Play className='cx:size-3.5' aria-hidden />}
                        {paused === null ? 'Pause' : 'Resume'}
                    </span>
                </Button.Text>
            </div>
            <div className='cx:grid cx:grid-cols-1 cx:gap-2 cx:sm:gap-4 cx:md:grid-cols-2'>
                {graphs.map((graph) => {
                    const large = expanded === graph.key;

                    return (
                        <ChartCard
                            key={graph.key}
                            title={graph.title}
                            className={cn(large && 'cx:md:col-span-2')}
                            legend={
                                <span className='cx:flex cx:min-w-0 cx:items-center cx:gap-2'>
                                    <Totals summaries={graph.summaries} format={graph.format} />
                                    <RowActionButton
                                        icon={large ? Minimize2 : Maximize2}
                                        label={large ? 'Smaller' : 'Larger'}
                                        aria-label={`${large ? 'Shrink' : 'Enlarge'} the ${graph.title} graph`}
                                        onClick={() => setExpanded(large ? null : graph.key)}
                                    />
                                </span>
                            }
                        >
                            {samples.length < 2 ? (
                                <p className='cx:flex cx:items-center cx:justify-center cx:text-sm cx:text-muted-foreground' style={{ height: large ? 280 : 150 }}>
                                    {model.live ? 'Waiting for the server’s readings…' : 'The server is not running.'}
                                </p>
                            ) : (
                                <div className='cx:px-3 cx:pb-3'>
                                    <Chart
                                        times={times}
                                        series={graph.series}
                                        from={from}
                                        to={to}
                                        limit={graph.limit}
                                        floor={graph.floor}
                                        format={graph.format}
                                        height={large ? 280 : 150}
                                    />
                                </div>
                            )}
                        </ChartCard>
                    );
                })}
            </div>
        </div>
    );
}
