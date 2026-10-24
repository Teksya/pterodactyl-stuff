import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http } from '@pterodactyl/sdk/api';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import Chart from './Chart';
import { addSample, historyOf, KEEP_MS, parseStats, rates, summarize, type Sample } from './history';
import StatsView from './StatsView';
import { shortBytes } from './format';

let host: ExtensionTestHost | null = null;

afterEach(() => {
    host?.dispose();
    host = null;
    cleanup();
    vi.restoreAllMocks();
});

const sample = (t: number, rx: number, tx: number): Sample => ({ t, cpu: 5, memory: 100, disk: 10, rx, tx });

test("reads Wings' stats and turns the network totals into rates", () => {
    expect(parseStats('{"cpu_absolute":12.5,"memory_bytes":1024,"disk_bytes":2048,"network":{"rx_bytes":10,"tx_bytes":20},"uptime":5}', 1000)).toEqual({
        t: 1000,
        cpu: 12.5,
        memory: 1024,
        disk: 2048,
        rx: 10,
        tx: 20,
    });
    expect(parseStats('not json')).toBeNull();
    expect(parseStats('{"cpu_absolute":1}')).toBeNull();

    const flow = rates([sample(0, 0, 0), sample(2000, 4000, 1000), sample(4000, 3000, 2000), sample(60_000, 9000, 9000)]);
    // 4000 bytes in 2 s; a restart (totals back down) is 0; a gap of a minute is no rate.
    expect(flow.rx).toEqual([null, 2000, 0, null]);
    expect(flow.tx).toEqual([null, 500, 500, null]);

    expect(summarize([null, 2, 4, null])).toEqual({ current: 4, average: 3, peak: 4 });
    expect(summarize([null])).toEqual({ current: null, average: null, peak: null });

    expect([105.84, 2048, 1.5 * 1024 ** 2, 137.9 * 1024 ** 2].map(shortBytes)).toEqual(['106 B', '2.00 KiB', '1.50 MiB', '137.9 MiB']);
});

test('keeps an hour of readings and counts a reading heard twice once', () => {
    const server = 'history-test';
    const start = 1_000_000;
    addSample(server, sample(start, 0, 0));
    addSample(server, sample(start + 100, 0, 0));
    addSample(server, sample(start + KEEP_MS + 2000, 0, 0));
    addSample(server, sample(start + KEEP_MS + 4000, 0, 0));

    // The second came 100 ms after the first (the same event, heard by both views); the first is
    // an hour older than the last, so it went.
    expect(historyOf(server).map((item) => item.t)).toEqual([start + KEEP_MS + 2000, start + KEEP_MS + 4000]);
});

test('shows the time and values under the pointer', () => {
    const times = [0, 1000, 2000, 3000];
    render(
        <div style={{ width: 400 }}>
            <Chart
                times={times}
                series={[
                    { label: 'In', color: 'red', values: [null, 100, 200, 300] },
                    { label: 'Out', color: 'blue', values: [null, 10, 20, 30] },
                ]}
                from={0}
                to={3000}
                format={(value) => `${value} B/s`}
            />
        </div>
    );
    const chart = document.querySelector('svg')!.parentElement!;
    chart.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 160, right: 300, bottom: 160, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.pointerMove(chart, { clientX: 200 });
    screen.getByText('200 B/s');
    screen.getByText('20 B/s');
    fireEvent.pointerLeave(chart);
    expect(screen.queryByText('200 B/s')).toBeNull();
});

test('draws the cards with meters, the start time and the network totals', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: { data: {} } });
    host = createExtensionTestHost({ server: createTestServer({ name: 'Survival' }), prefix: 'cx' });
    const metric = (value: number, limit: number) => ({ value, limit, alarm: null });
    const model = {
        state: 'running',
        address: '203.0.113.10:25565',
        uptime: 3_600_000,
        cpu: metric(12, 200),
        memory: metric(512 * 1024 ** 2, 1024 ** 3),
        disk: metric(1024 ** 3, 0),
        network: { rx: 5 * 1024 ** 2, tx: 1024 ** 2 },
    };
    render(<StatsView {...({ model, Default: () => null } as unknown as Parameters<typeof StatsView>[0])} />, { wrapper: host.Wrapper });

    await screen.findByText('Network in');
    screen.getByText('Network out');
    expect(screen.getAllByText(/total$/).length).toBe(2);
    expect(screen.getByText(/^since /)).toBeTruthy();
});
