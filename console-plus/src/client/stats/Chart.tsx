import { useRef, useState } from 'react';

export interface Series {
    label: string;
    /** A CSS colour, such as `var(--chart-1)`. */
    color: string;
    /** One value per time, null where there is none. */
    values: (number | null)[];
}

const WIDTH = 1000;

/** A round maximum for the axis: 1, 2, 2.5 or 5 times a power of ten, above the value. */
function niceMax(value: number): number {
    if (value <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;

    return 10 * power;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * A time series drawn in SVG with the theme's chart colours: an area per series, an optional
 * dashed limit, and on hover the time and every value at the pointer.
 */
export default function Chart({
    times,
    series,
    from,
    to,
    limit = 0,
    floor = 0,
    format,
    height = 160,
}: {
    times: number[];
    series: Series[];
    from: number;
    to: number;
    /** A dashed line at the server's limit; 0 for none. */
    limit?: number;
    /** The least the axis goes up to, so a quiet server does not look busy. */
    floor?: number;
    format: (value: number) => string;
    height?: number;
}) {
    const box = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<number | null>(null);

    const visible = times.map((t) => t >= from - 5_000 && t <= to);
    const peak = Math.max(0, ...series.flatMap((line) => line.values.filter((value, index): value is number => value !== null && visible[index])));
    const max = niceMax(Math.max(peak * 1.1, limit, floor));
    const x = (t: number) => ((t - from) / Math.max(1, to - from)) * WIDTH;
    const y = (value: number) => height - (value / max) * height;

    // Each series as runs of known values: a gap (a missing reading) breaks the line.
    const paths = series.map((line) => {
        const runs: { top: string; area: string }[] = [];
        let run: [number, number][] = [];
        const flush = () => {
            if (run.length > 0) {
                const top = run.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
                runs.push({ top, area: `${top}L${run.at(-1)![0].toFixed(1)},${height}L${run[0][0].toFixed(1)},${height}Z` });
            }
            run = [];
        };
        line.values.forEach((value, index) => {
            if (value === null || !visible[index]) flush();
            else run.push([x(times[index]), y(value)]);
        });
        flush();

        return runs;
    });

    const onMove = (event: React.PointerEvent) => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect || times.length === 0) return;
        const t = from + ((event.clientX - rect.left) / rect.width) * (to - from);
        let nearest = -1;
        times.forEach((time, index) => {
            if (visible[index] && (nearest < 0 || Math.abs(time - t) < Math.abs(times[nearest] - t))) nearest = index;
        });
        setHover(nearest >= 0 ? nearest : null);
    };

    const hoverX = hover !== null ? (x(times[hover]) / WIDTH) * 100 : 0;

    return (
        <div className='cx:flex cx:w-full cx:gap-2 cx:select-none' style={{ height }}>
            {/* The axis in its own column, so the lines never run over its values. */}
            <div className='cx:relative cx:w-[4.5rem] cx:shrink-0 cx:text-right cx:text-[0.7rem] cx:leading-none cx:text-muted-foreground' aria-hidden>
                <span className='cx:absolute cx:top-0 cx:right-0'>{format(max)}</span>
                <span className='cx:absolute cx:right-0 cx:-translate-y-1/2' style={{ top: height / 2 }}>
                    {format(max / 2)}
                </span>
                <span className='cx:absolute cx:right-0 cx:bottom-0'>{format(0)}</span>
            </div>
            <div ref={box} className='cx:relative cx:min-w-0 cx:flex-1' onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
                {/* Clipped to its box: the reading just before the range starts the line at the left edge, from outside it. */}
                <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio='none' className='cx:absolute cx:inset-0 cx:size-full cx:overflow-hidden' aria-hidden>
                    {[0.5, 1].map((share) => (
                        <line key={share} x1={0} x2={WIDTH} y1={y(max * share)} y2={y(max * share)} stroke='var(--border)' strokeDasharray='4 6' vectorEffect='non-scaling-stroke' />
                    ))}
                    <line x1={0} x2={WIDTH} y1={height} y2={height} stroke='var(--border)' vectorEffect='non-scaling-stroke' />
                    {limit > 0 && <line x1={0} x2={WIDTH} y1={y(limit)} y2={y(limit)} stroke='var(--destructive)' strokeOpacity={0.6} strokeDasharray='8 6' vectorEffect='non-scaling-stroke' />}
                    {paths.map((runs, index) =>
                        runs.map(({ top, area }, run) => (
                            <g key={`${index}-${run}`}>
                                <path d={area} fill={series[index].color} fillOpacity={0.14} />
                                <path d={top} fill='none' stroke={series[index].color} strokeWidth={2} vectorEffect='non-scaling-stroke' strokeLinejoin='round' />
                            </g>
                        ))
                    )}
                </svg>
                {hover !== null && (
                    <>
                        <div className='cx:pointer-events-none cx:absolute cx:inset-y-0 cx:w-px cx:bg-foreground/40' style={{ left: `${hoverX}%` }} />
                        {series.map((line) =>
                            line.values[hover] !== null ? (
                                <span
                                    key={line.label}
                                    className='cx:pointer-events-none cx:absolute cx:size-2 cx:-translate-x-1/2 cx:-translate-y-1/2 cx:rounded-full cx:ring-2 cx:ring-card'
                                    style={{ left: `${hoverX}%`, top: y(line.values[hover]!), background: line.color }}
                                />
                            ) : null
                        )}
                        <div
                            className='cx:pointer-events-none cx:absolute cx:top-1 cx:z-10 cx:rounded-md cx:bg-popover cx:px-2 cx:py-1 cx:text-xs cx:whitespace-nowrap cx:text-foreground cx:shadow-lg'
                            style={hoverX > 60 ? { right: `${100 - hoverX + 1}%` } : { left: `${hoverX + 1}%` }}
                        >
                            <div className='cx:text-muted-foreground'>{clock(times[hover])}</div>
                            {series.map((line) => (
                                <div key={line.label} className='cx:flex cx:items-center cx:gap-1.5'>
                                    <span className='cx:size-2 cx:rounded-full' style={{ background: line.color }} />
                                    {series.length > 1 && <span className='cx:text-muted-foreground'>{line.label}</span>}
                                    <span className='cx:font-medium'>{line.values[hover] === null ? '—' : format(line.values[hover]!)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
