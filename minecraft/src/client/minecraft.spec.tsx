import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ExtensionSetupContext } from '@pterodactyl/sdk';
import { client, http } from '@pterodactyl/sdk/api';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@pterodactyl/sdk/testing';
import manifest from '../../extension.json';
import extension from './index';
import { closestVersion, parseVersion } from './players/catalog';
import InventoryPanel from './players/InventoryPanel';
import { durability, maxDurability, playTime, shortName } from './players/items';
import PlayerDetail, { LIVE_REFRESH } from './players/PlayerDetail';
import PlayerList from './players/PlayerList';
import { RconDialog } from './players/PlayersScreen';
import { Hearts } from './players/Vitals';
import { parseProperties, serializeProperties } from './properties/file';
import { motdLines } from './properties/motd';
import PropertiesScreen from './properties/PropertiesScreen';
import { settings } from './settings';
import { itemPictures } from './textures';
import SnapshotsTab from './world/SnapshotsTab';
import type { Item, Player, Profile, WorldsData } from './types';

let host: ExtensionTestHost | null = null;

function withHost(children: ReactNode, permissions = ['*']) {
    host = createExtensionTestHost({
        prefix: 'mc',
        server: createTestServer({ uuid: 'abc', identifier: 'abc1', permissions, eggTags: ['minecraft'] }),
    });

    return render(children, { wrapper: host.Wrapper });
}

afterEach(() => {
    cleanup();
    host?.dispose();
    host = null;
    vi.restoreAllMocks();
    settings.textures = true;
    // The page remembers the job it follows.
    window.localStorage.clear();
});

const item = (overrides: Partial<Item>): Item => ({
    slot: 'inventory.0',
    id: 'minecraft:stone',
    count: 1,
    name: null,
    enchantments: [],
    damage: null,
    maxDamage: null,
    unbreakable: false,
    ...overrides,
});

const steve: Player = {
    uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
    name: 'Steve',
    online: false,
    op: 4,
    whitelisted: true,
    banned: null,
    lastSeen: '2026-10-24T20:00:00+00:00',
};

const profile: Profile = {
    ...steve,
    saved: true,
    health: 6.5,
    maxHealth: 20,
    food: 18,
    saturation: 2,
    xpLevel: 37,
    xpProgress: 0.5,
    air: 300,
    gamemode: 'survival',
    flying: false,
    position: { x: -141.7, y: 66, z: 12.2 },
    dimension: 'minecraft:the_nether',
    selectedSlot: 0,
    effects: [{ id: 'minecraft:night_vision', amplifier: 0, duration: 3600 }],
    inventory: [
        item({ slot: 'inventory.0', id: 'minecraft:diamond_sword', damage: 561, enchantments: [{ id: 'minecraft:sharpness', level: 5 }] }),
        item({ slot: 'inventory.9', id: 'minecraft:cobblestone', count: 64 }),
    ],
    armor: { head: item({ slot: 'armor.head', id: 'minecraft:iron_helmet' }), chest: null, legs: null, feet: null },
    offhand: item({ slot: 'offhand', id: 'minecraft:shield' }),
    enderItems: [item({ slot: 'ender.3', id: 'minecraft:ender_pearl', count: 16 })],
    stats: {
        playTime: 20 * 60 * 60 * 24 * 11 + 20 * 60 * 60 * 15,
        deaths: 13,
        mobKills: 86,
        playerKills: 2,
        damageDealt: 0,
        damageTaken: 0,
        jumps: 55810,
        timesJoined: 0,
        blocksMined: 39214,
        itemsCrafted: 0,
        distances: [
            { id: 'walk', blocks: 592029 },
            { id: 'fly', blocks: 11720 },
        ],
        mined: [{ id: 'stone', count: 32544 }],
        killed: [{ id: 'creeper', count: 294 }],
        killedBy: [],
    },
    version: '1.21.4',
};

test('registers every screen of the manifest, each for Minecraft servers only, and reads the textures setting', () => {
    const register = vi.fn();
    extension.setup({ meta: { id: 'minecraft' }, config: { textures: false }, screens: { register } } as unknown as ExtensionSetupContext);

    expect(register.mock.calls.map(([id]) => id).sort()).toEqual(manifest.ui.screens.map((screen) => screen.id).sort());
    for (const screen of manifest.ui.screens) expect(screen.when).toEqual({ eggTags: { any: ['minecraft'] } });
    expect(settings.textures).toBe(false);
});

test('changes server.properties in place and keeps the rest of the file', () => {
    const file = parseProperties('#Minecraft server properties\nlevel-type=minecraft\\:normal\nmotd=A \\u00E9t\\u00E9 server\nmax-players=20\ncustom.plugin-key=yes\n');

    expect(file.values.get('level-type')).toBe('minecraft:normal');
    expect(file.values.get('motd')).toBe('A été server');
    expect(serializeProperties(file, { 'max-players': '50', motd: '§aHi\nthere', 'enable-rcon': 'true' })).toBe(
        '#Minecraft server properties\nlevel-type=minecraft\\:normal\nmotd=\\u00A7aHi\\nthere\nmax-players=50\ncustom.plugin-key=yes\nenable-rcon=true\n'
    );
});

test('reads the colours and formats of a message of the day', () => {
    const [first, second] = motdLines('§6Gold §lbold\n§7second');

    expect(first.map((run) => run.text)).toEqual(['Gold ', 'bold']);
    expect(first[0].style.color).toBe('#FFAA00');
    expect(first[1].style).toMatchObject({ color: '#FFAA00', fontWeight: 700 });
    expect(second[0]).toMatchObject({ text: 'second', style: { color: '#AAAAAA' } });
});

test('names items, their wear and play time', () => {
    expect(shortName('minecraft:diamond_sword')).toBe('Dsw');
    expect(maxDurability(item({ id: 'minecraft:netherite_chestplate' }))).toBe(592);
    expect(durability(item({ id: 'minecraft:diamond_sword', damage: 1561 / 2 }))).toBeCloseTo(0.5);
    expect(durability(item({ id: 'minecraft:stone', damage: 3 }))).toBeNull();
    expect(playTime(profile.stats!.playTime)).toBe('11d 15h');
    expect(playTime(20 * 60 * 75)).toBe('1h 15m');
});

test("finds item pictures only for the game's own items, and none with the setting off", () => {
    expect(itemPictures('minecraft:oak_log')[0]).toBe('https://mc.nerothe.com/img/1.21.11/minecraft_oak_log.png');
    expect(itemPictures('create:wrench')).toEqual([]);
    settings.textures = false;
    expect(itemPictures('minecraft:oak_log')).toEqual([]);
});

test("picks the item list of the server's version, or the closest older one", () => {
    const available = ['1.8', '1.12.2', '1.20.4', '1.21.4', '1.21.11', '26.1'];
    expect(closestVersion(available, parseVersion('Paper 1.21.4'))).toBe('1.21.4');
    expect(closestVersion(available, parseVersion('1.21.8'))).toBe('1.21.4');
    expect(closestVersion(available, parseVersion('1.7.10'))).toBe('1.8');
    expect(closestVersion(available, null)).toBe('26.1');
});

test('draws ten hearts for twenty points, halves included', () => {
    render(<Hearts health={7} max={20} />);
    const hearts = screen.getByRole('img', { name: 'Health: 7 of 20' });

    expect(hearts.querySelectorAll('svg')).toHaveLength(10);
});

test('lays the inventory out as in the game, and moves, removes and gives items', async () => {
    const actions = { onMove: vi.fn(), onRemove: vi.fn(), onPick: vi.fn() };
    settings.textures = false;
    withHost(<InventoryPanel profile={profile} actions={actions} />);

    const hotbar = await screen.findByRole('group', { name: 'Hotbar' });
    expect(hotbar.querySelectorAll('[data-slot]')).toHaveLength(9);
    expect(within(screen.getByRole('group', { name: 'Inventory' })).getByLabelText('64 × Cobblestone')).toBeTruthy();
    expect(screen.getByLabelText('1 × Iron helmet')).toBeTruthy();

    // Drag the sword onto an empty slot, then onto the cobblestone.
    const data = new Map<string, string>();
    const dataTransfer = { setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? '', effectAllowed: '' };
    fireEvent.dragStart(screen.getByLabelText('1 × Diamond sword'), { dataTransfer });
    fireEvent.drop(hotbar.querySelector('[data-slot="inventory.4"]')!, { dataTransfer });
    fireEvent.drop(screen.getByLabelText('64 × Cobblestone'), { dataTransfer });
    expect(actions.onMove.mock.calls).toEqual([
        ['inventory.0', 'inventory.4', false],
        ['inventory.0', 'inventory.9', true],
    ]);

    fireEvent.click(hotbar.querySelector('[data-slot="inventory.5"]')!);
    expect(actions.onPick).toHaveBeenCalledWith('inventory.5');

    fireEvent.contextMenu(screen.getByLabelText('1 × Diamond sword'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Remove/ }));
    expect(actions.onRemove).toHaveBeenCalledWith('inventory.0', expect.objectContaining({ id: 'minecraft:diamond_sword' }));
});

test('lists the players as the plugin does: tabs with counts, a search, a row of actions each', async () => {
    const onView = vi.fn();
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { message: 'Done.', command: 'op Alex' } });
    vi.spyOn(http, 'get').mockResolvedValue({ data: profile });
    const players: Player[] = [steve, { ...steve, uuid: '11111111-1111-1111-1111-111111111111', name: 'Alex', op: null, online: true, whitelisted: false }, { ...steve, uuid: '22222222-2222-2222-2222-222222222222', name: 'Griefer', op: null, banned: 'Griefing' }];
    settings.textures = false;
    withHost(<PlayerList players={players} onView={onView} />);

    const names = () => screen.queryAllByRole('button', { name: /^View / }).map((button) => button.getAttribute('aria-label'));
    expect(await screen.findByRole('tab', { name: 'All 3' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Online 1' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Offline 2' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'OP 1' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Banned 1' })).toBeTruthy();
    expect(names()).toHaveLength(3);

    fireEvent.click(screen.getByRole('tab', { name: 'Online 1' }));
    expect(names()).toEqual(['View Alex']);
    fireEvent.click(screen.getByRole('tab', { name: 'Banned 1' }));
    expect(names()).toEqual(['View Griefer']);
    expect(screen.getByRole('button', { name: 'Unban Griefer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'All 3' }));
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'ste' } });
    expect(names()).toEqual(['View Steve']);
    // Steve is offline: no kick.
    expect((screen.getByRole('button', { name: 'Kick Steve' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'View Steve' }));
    expect(onView).toHaveBeenCalledWith(steve.uuid);

    // OP asks first, in the plugin's words.
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'OP Alex' }));
    expect(await screen.findByText('Are you sure you want to make Alex an Operator (OP)?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OP' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/minecraft/players/11111111-1111-1111-1111-111111111111/actions', { action: 'op' }));
});

test("shows a player's page in the plugin's sections, with the panel's tools", async () => {
    settings.textures = false;
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { ...profile, source: 'file', liveVia: null } });
    withHost(<PlayerDetail uuid={steve.uuid} online={[]} />);

    expect(await screen.findByRole('img', { name: 'Health: 7 of 20' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith(`/api/client/servers/abc/extensions/minecraft/players/${steve.uuid}`);
    for (const section of ['Identity', 'Statistics', 'Status', 'Inventory', 'Ender Chest', 'Management']) {
        expect(screen.getByRole('heading', { name: section })).toBeTruthy();
    }
    expect(screen.getByText('Offline - Displaying data from last save file')).toBeTruthy();
    expect(screen.getByText(steve.uuid)).toBeTruthy();
    expect(screen.getByText('11d 15h')).toBeTruthy();
    expect(screen.getByText(/^592\D?029 m$/)).toBeTruthy();
    expect(screen.getByText('(6.5)')).toBeTruthy();
    expect(screen.getByText('The Nether')).toBeTruthy();
    expect(screen.getByText('-142, 66, 12')).toBeTruthy();
    expect(screen.getByText('OP 4')).toBeTruthy();
    expect(screen.getByText('Whitelisted')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Ender chest' })).toBeTruthy();
    // The plugin's four actions, then the panel's: offline, messages and kicks need the player online.
    expect(screen.getByRole('button', { name: 'DEOP' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear Inv' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kick' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ban' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Message' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Heal' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'All statistics' }));
    expect(await screen.findByText('Walked')).toBeTruthy();
    expect(screen.getByText('Creeper')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fold Ender Chest' }));
    expect(screen.queryByRole('group', { name: 'Ender chest' })).toBeNull();
});

test('follows an online player read over RCON on its own, and leaves an offline one alone', async () => {
    settings.textures = false;
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { ...profile, online: true, source: 'live', liveVia: 'rcon' } });
    withHost(<PlayerDetail uuid={steve.uuid} online={['Steve']} />);

    expect(await screen.findByText(`Real-time data from server · updates every ${LIVE_REFRESH / 1000} seconds`)).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: LIVE_REFRESH + 1500 });
    cleanup();
    host?.dispose();

    get.mockClear();
    get.mockResolvedValue({ data: { ...profile, online: false, source: 'file', liveVia: null } });
    withHost(<PlayerDetail uuid={steve.uuid} online={[]} />);
    expect(await screen.findByText('Offline - Displaying data from last save file')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, LIVE_REFRESH + 500));
    expect(get).toHaveBeenCalledTimes(1);
}, 15_000);

test('says where an online player is read from, and offers RCON when it is off', async () => {
    settings.textures = false;
    const onTurnOnRcon = vi.fn();
    vi.spyOn(http, 'get').mockResolvedValue({ data: { ...profile, online: true, source: 'file', liveVia: 'off' } });
    withHost(<PlayerDetail uuid={steve.uuid} online={['Steve']} onTurnOnRcon={onTurnOnRcon} />);

    expect(await screen.findByText(/RCON disabled - Displaying data from save file/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on RCON' }));
    expect(onTurnOnRcon).toHaveBeenCalled();
});

const worldsData: WorldsData = {
    active: 'world',
    worlds: [
        { folder: 'world', folders: ['world', 'world_nether'], active: true, found: true, name: 'world', version: '1.21.4', seed: '1', hardcore: false, gameMode: 'survival', lastPlayed: null },
        { folder: 'creative', folders: ['creative'], active: false, found: true, name: 'Creative build', version: '1.21.4', seed: '2', hardcore: false, gameMode: 'creative', lastPlayed: null },
    ],
    snapshots: [{ uuid: 'snap-1', name: 'Before the update', worlds: ['world', 'world_nether'], size: 1024, version: '1.21.1', automatic: false, path: '.snapshots/snap-1.tar.gz', created_at: '2026-10-24T10:00:00+00:00', missing: false }],
    schedule: { interval_hours: 0, keep: 5, last_run_at: null },
    limits: { manual: 10 },
};

test('turns RCON on on a free allocation port, or asks for one', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { enabled: true, port: 25580, allocated: true, password: true, ports: [25580, 25590] } });
    let { unmount } = withHost(<RconDialog open status={{ enabled: false, port: 25575, allocated: false, password: false, ports: [25580, 25590] }} onClose={() => {}} />);

    // Without a password yet, nothing to ask: a new random one.
    expect(await screen.findByText(/Nobody else needs it/)).toBeTruthy();
    expect(screen.queryByText('Keep the current password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on RCON' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/minecraft/rcon', { port: 25580, new_password: true }));
    expect(await screen.findByText(/RCON is on, on port 25580\. It starts with the server's next start\./)).toBeTruthy();
    unmount();
    host?.dispose();

    // With one already in server.properties, it is kept unless the user asks for a new one.
    ({ unmount } = withHost(<RconDialog open status={{ enabled: false, port: 25575, allocated: false, password: true, ports: [25580, 25590] }} onClose={() => {}} />));
    expect(await screen.findByText('The password in server.properties stays as it is.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on RCON' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/api/client/servers/abc/extensions/minecraft/rcon', { port: 25580, new_password: false }));
    unmount();
    host?.dispose();

    withHost(<RconDialog open status={{ enabled: false, port: 25575, allocated: false, password: false, ports: [] }} onClose={() => {}} />);
    expect(await screen.findByText(/Add an allocation in the Network tab/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on RCON' })).toBeNull();
});

test('lists worlds and snapshots, takes one, then follows it as one job at a time', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: worldsData });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { job: 'job-1' } });
    withHost(<SnapshotsTab />);

    expect(await screen.findByText('Creative build')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('world · world_nether')).toBeTruthy();
    expect(screen.getByText('1 of 10 snapshots taken by hand. They live in the server\'s .snapshots folder and count towards its disk space.')).toBeTruthy();
    // The active world cannot be deleted.
    expect((screen.getByRole('button', { name: 'Delete world' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Take a snapshot/ }));
    fireEvent.change(await screen.findByLabelText('Name (optional)'), { target: { value: 'Before the event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Take it' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/minecraft/snapshots', { name: 'Before the event', worlds: ['world'] }));
    // One job at a time: the page follows the snapshot, so the next one waits.
    await waitFor(() => expect((screen.getByRole('button', { name: /Take a snapshot/ }) as HTMLButtonElement).disabled).toBe(true));
});

test('restores a snapshot keeping one of the current worlds first', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: worldsData });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { job: 'job-2' } });
    withHost(<SnapshotsTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore Before the update' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/client/servers/abc/extensions/minecraft/snapshots/snap-1/restore', { safety: true }));
});

test('saves only the changed keys of server.properties after a review', async () => {
    const contents = '#Minecraft server properties\nmax-players=20\nmotd=A Minecraft Server\nmy-plugin=on\n';
    // The panel's own file queries go through the generated API client; the icon link through http.
    vi.spyOn(client, 'get').mockImplementation((async () => ({ data: contents })) as unknown as typeof client.get);
    const post = vi.spyOn(client, 'post').mockImplementation((async () => ({ data: undefined })) as unknown as typeof client.post);
    vi.spyOn(http, 'get').mockRejectedValue(Object.assign(new Error('Not found'), { response: { status: 404 } }));

    withHost(<PropertiesScreen data={{ pathname: '/', params: {}, search: {} }} />);

    const players = await screen.findByLabelText(/Maximum players/);
    fireEvent.change(players, { target: { value: '42' } });
    fireEvent.blur(players);
    expect(await screen.findByText('my-plugin')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review and save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [options] = post.mock.calls[0] as unknown as [{ url: string; body: unknown }];
    expect(options.url).toContain('/files/write');
    expect(options.body).toBe('#Minecraft server properties\nmax-players=42\nmotd=A Minecraft Server\nmy-plugin=on\n');
});
