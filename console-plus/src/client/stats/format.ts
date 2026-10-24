const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes in the largest unit under 1024, with one decimal (two under 10): short enough for a header or a card. */
export function shortBytes(value: number): string {
    let unit = 0;
    let amount = value;
    while (amount >= 1024 && unit < UNITS.length - 1) {
        amount /= 1024;
        unit++;
    }

    return `${unit === 0 ? Math.round(amount) : amount.toFixed(amount < 10 ? 2 : 1)} ${UNITS[unit]}`;
}

export const bytesRate = (value: number) => `${shortBytes(value)}/s`;
