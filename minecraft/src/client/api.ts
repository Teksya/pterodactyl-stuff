import { http } from '@pterodactyl/sdk/api';
import type { ActionResult, IpBan, Overview, Player, Profile, RconStatus, WorldInfo, WorldsData } from './types';

export const ROOT_KEY = ['extensions', 'minecraft'] as const;

const base = (uuid: string) => `/api/client/servers/${uuid}/extensions/minecraft`;

export const keys = {
    overview: (uuid: string) => [...ROOT_KEY, uuid, 'overview'] as const,
    players: (uuid: string) => [...ROOT_KEY, uuid, 'players'] as const,
    player: (uuid: string, player: string) => [...ROOT_KEY, uuid, 'player', player] as const,
    ipBans: (uuid: string) => [...ROOT_KEY, uuid, 'ip-bans'] as const,
    world: (uuid: string) => [...ROOT_KEY, uuid, 'world'] as const,
    worlds: (uuid: string) => [...ROOT_KEY, uuid, 'worlds'] as const,
    icon: (uuid: string) => [...ROOT_KEY, uuid, 'icon'] as const,
};

export async function overview(uuid: string): Promise<Overview> {
    return (await http.get(`${base(uuid)}/overview`)).data;
}

/**
 * Turns RCON on, on one of the server's allocation ports, with the current password or a new random
 * one; it takes effect after a restart.
 */
export async function enableRcon(uuid: string, port: number, newPassword: boolean): Promise<RconStatus> {
    return (await http.post(`${base(uuid)}/rcon`, { port, new_password: newPassword })).data;
}

export async function players(uuid: string): Promise<Player[]> {
    return (await http.get(`${base(uuid)}/players`)).data.players;
}

/** An online player is read live, over RCON or from the console; an offline one from their saved file. */
export async function profile(uuid: string, player: string): Promise<Profile> {
    return (await http.get(`${base(uuid)}/players/${player}`)).data;
}

export type PlayerAction =
    | { action: 'kick' | 'ban'; reason?: string }
    | { action: 'pardon' | 'op' | 'deop' | 'whitelist_add' | 'whitelist_remove' | 'heal' | 'feed' | 'kill' | 'effect_clear' }
    | { action: 'op_level'; level: number }
    | { action: 'gamemode'; mode: string }
    | { action: 'teleport'; to?: string; x?: number; y?: number; z?: number; dimension?: string }
    | { action: 'clear'; item?: string }
    | { action: 'give'; item: string; count: number; slot?: string }
    | { action: 'remove_slot'; slot: string }
    | { action: 'move'; from: string; to: string }
    | { action: 'effect'; effect: string; seconds: number; amplifier: number }
    | { action: 'xp'; amount: number; unit: 'levels' | 'points' }
    | { action: 'message' | 'title'; text: string };

export async function playerAction(uuid: string, player: string, action: PlayerAction): Promise<ActionResult> {
    return (await http.post(`${base(uuid)}/players/${player}/actions`, action)).data;
}

export type ListName = 'whitelist' | 'ops' | 'banned-players';

export async function addByName(uuid: string, name: string, list: ListName, reason?: string): Promise<ActionResult> {
    return (await http.post(`${base(uuid)}/players/add`, { name, list, reason: reason || null })).data;
}

export async function broadcast(uuid: string, text: string): Promise<ActionResult> {
    return (await http.post(`${base(uuid)}/broadcast`, { text })).data;
}

export async function ipBans(uuid: string): Promise<IpBan[]> {
    return (await http.get(`${base(uuid)}/ip-bans`)).data.bans;
}

export async function changeIpBan(uuid: string, ip: string, add: boolean, reason?: string): Promise<ActionResult> {
    return (await http.post(`${base(uuid)}/ip-bans`, { ip, add, reason: reason || null })).data;
}

export type WorldAction =
    | { action: 'weather'; weather: 'clear' | 'rain' | 'thunder' }
    | { action: 'time'; time: 'day' | 'noon' | 'night' | 'midnight' }
    | { action: 'difficulty'; difficulty: 'peaceful' | 'easy' | 'normal' | 'hard' }
    | { action: 'gamerule'; rule: string; value: string }
    | { action: 'save' }
    | { action: 'say'; text: string };

export async function world(uuid: string): Promise<WorldInfo> {
    return (await http.get(`${base(uuid)}/world`)).data;
}

export async function worldAction(uuid: string, action: WorldAction): Promise<ActionResult> {
    return (await http.post(`${base(uuid)}/world/actions`, action)).data;
}

export async function worlds(uuid: string): Promise<WorldsData> {
    return (await http.get(`${base(uuid)}/worlds`)).data;
}

export async function activateWorld(uuid: string, folder: string): Promise<{ message: string }> {
    return (await http.post(`${base(uuid)}/worlds/activate`, { folder })).data;
}

export async function createWorld(uuid: string, folder: string, seed: string, type: string): Promise<{ message: string }> {
    return (await http.post(`${base(uuid)}/worlds/create`, { folder, seed: seed || null, type: type || null })).data;
}

export async function deleteWorld(uuid: string, folder: string): Promise<{ message: string }> {
    return (await http.post(`${base(uuid)}/worlds/delete`, { folder })).data;
}

/** Queues a snapshot; the answer names the job whose progress the page follows. */
export async function takeSnapshot(uuid: string, name: string, folders?: string[]): Promise<{ job: string }> {
    return (await http.post(`${base(uuid)}/snapshots`, { name: name || null, worlds: folders ?? null })).data;
}

export async function restoreSnapshot(uuid: string, snapshot: string, safety: boolean): Promise<{ job: string }> {
    return (await http.post(`${base(uuid)}/snapshots/${snapshot}/restore`, { safety })).data;
}

export async function deleteSnapshot(uuid: string, snapshot: string): Promise<{ message: string }> {
    return (await http.delete(`${base(uuid)}/snapshots/${snapshot}`)).data;
}

export async function saveSchedule(uuid: string, intervalHours: number, keep: number): Promise<{ message: string }> {
    return (await http.put(`${base(uuid)}/snapshots/schedule`, { interval_hours: intervalHours, keep })).data;
}

export async function uploadIcon(uuid: string, file: File): Promise<void> {
    const form = new FormData();
    form.append('icon', file);
    await http.post(`${base(uuid)}/icon`, form);
}

/** A short-lived link to a server file, from the panel's own download endpoint. */
export async function fileUrl(uuid: string, file: string): Promise<string> {
    const { data } = await http.get(`/api/client/servers/${uuid}/files/download`, { params: { file } });

    return data.attributes.url;
}
