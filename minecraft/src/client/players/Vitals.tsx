// Pixel icons drawn here, in the spirit of the game's: each "#" is one pixel.
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const SHANK = ['....##.', '...####', '..#####', '.####..', '.##....', '#......'];

type Fill = 'full' | 'half' | 'empty';

function Pixels({ rows, fill, colour, label }: { rows: string[]; fill: Fill; colour: string; label?: string }) {
    const width = rows[0].length;

    return (
        <svg viewBox={`-0.5 -0.5 ${width + 1} ${rows.length + 1}`} className='mc:size-5 mc:shrink-0 mc:sm:size-6 mc:drop-shadow-sm' shapeRendering='crispEdges' role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
            {rows.flatMap((row, y) =>
                [...row].map((pixel, x) => {
                    if (pixel !== '#') return null;
                    const lit = fill === 'full' || (fill === 'half' && x < Math.floor(width / 2));

                    return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={lit ? colour : '#3a3a3a'} stroke='#000' strokeWidth={0.15} />;
                })
            )}
        </svg>
    );
}

/** Ten icons for twenty points, halves included, as the game shows health and hunger. */
function Row({ value, max, rows, colour, what }: { value: number; max: number; rows: string[]; colour: string; what: string }) {
    const icons = Math.max(10, Math.ceil(max / 2));

    return (
        <div className='mc:flex mc:flex-wrap mc:gap-1' role='img' aria-label={`${what}: ${value} of ${max}`}>
            {Array.from({ length: icons }, (_, index) => {
                const points = value - index * 2;

                return <Pixels key={index} rows={rows} colour={colour} fill={points >= 2 ? 'full' : points >= 1 ? 'half' : 'empty'} />;
            })}
        </div>
    );
}

export function Hearts({ health, max }: { health: number; max: number }) {
    return <Row value={Math.ceil(health)} max={max} rows={HEART} colour='#e3242b' what='Health' />;
}

export function Hunger({ food }: { food: number }) {
    return <Row value={food} max={20} rows={SHANK} colour='#c47a3d' what='Hunger' />;
}
