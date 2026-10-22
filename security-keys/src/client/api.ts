import { http } from '@pterodactyl/sdk/api';

export interface SecurityKey {
    id: number;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

type Options = Record<string, unknown>;

interface LoginResponse {
    complete: boolean;
    intended?: string;
}

const web = '/extensions/security-keys';
const account = '/api/client/extensions/security-keys/keys';
const admin = (user: number) => `/api/admin/extensions/security-keys/users/${user}/keys`;

export const accountKeysQueryKey = ['security-keys', 'account'] as const;
export const userKeysQueryKey = (user: number) => ['security-keys', 'user', user] as const;

export const listKeys = async () => (await http.get<{ data: SecurityKey[] }>(account)).data.data;

export const registrationOptions = async (password: string, passwordless: boolean) =>
    (await http.post<{ data: { public_key: Options } }>(`${account}/options`, { password, passwordless })).data.data.public_key;

export const storeKey = async (name: string, credential: Options) =>
    (await http.post<{ data: SecurityKey }>(account, { name, credential })).data.data;

export const renameKey = async (id: number, name: string) =>
    (await http.patch<{ data: SecurityKey }>(`${account}/${id}`, { name })).data.data;

export const deleteKey = async (id: number, password: string) => {
    await http.delete(`${account}/${id}`, { data: { password } });
};

export const listUserKeys = async (user: number) => (await http.get<{ data: SecurityKey[] }>(admin(user))).data.data;

export const deleteUserKey = async (user: number, id: number) => {
    await http.delete(`${admin(user)}/${id}`);
};

/** Null when the account behind the checkpoint has no key. */
export const checkpointOptions = async (token: string) =>
    (
        await http.post<{ data: { public_key: Options; only_method: boolean } | null }>(`${web}/checkpoint/options`, {
            confirmation_token: token,
        })
    ).data.data;

export const answerCheckpoint = async (token: string, credential: Options) =>
    (await http.post<{ data: LoginResponse }>(`${web}/checkpoint`, { confirmation_token: token, credential })).data.data;

export const loginOptions = async () =>
    (await http.post<{ data: { public_key: Options } }>(`${web}/login/options`)).data.data.public_key;

export const passwordlessLogin = async (credential: Options) =>
    (await http.post<{ data: LoginResponse }>(`${web}/login`, { credential })).data.data;
