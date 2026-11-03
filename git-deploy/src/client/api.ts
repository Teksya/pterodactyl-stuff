import { http } from '@pterodactyl/sdk/api';
import type { AdminRepository, Commit, Deployment, Meta, Page, Repository, RepositoryInput } from './types';

const base = (uuid: string) => `/api/client/servers/${uuid}/extensions/git-deploy`;

/** Every query starts with this, so one invalidation refreshes every screen. */
export const ROOT_KEY = ['git-deploy'] as const;
export const keys = {
    meta: (uuid: string) => [...ROOT_KEY, uuid, 'meta'] as const,
    deployments: (uuid: string, page: number) => [...ROOT_KEY, uuid, 'deployments', page] as const,
    deployment: (uuid: string, id: number) => [...ROOT_KEY, uuid, 'deployment', id] as const,
    commits: (uuid: string) => [...ROOT_KEY, uuid, 'commits'] as const,
    admin: () => [...ROOT_KEY, 'admin'] as const,
};

export const getMeta = async (uuid: string) => (await http.get<{ data: Meta }>(`${base(uuid)}/meta`)).data.data;

export const saveRepository = async (uuid: string, input: RepositoryInput) => (await http.put<{ data: Repository }>(`${base(uuid)}/repository`, input)).data.data;

export const unlinkRepository = async (uuid: string) => {
    await http.delete(`${base(uuid)}/repository`);
};

export const generateKey = async (uuid: string) => (await http.post<{ data: { ssh_public_key: string } }>(`${base(uuid)}/repository/key`)).data.data.ssh_public_key;

export const rotateSecret = async (uuid: string) => (await http.post<{ data: Repository }>(`${base(uuid)}/repository/secret`)).data.data;

export const listCommits = async (uuid: string) => (await http.get<{ data: Commit[] }>(`${base(uuid)}/commits`)).data.data;

export const deploy = async (uuid: string, commit?: Commit) =>
    (await http.post<{ data: Deployment }>(`${base(uuid)}/deploy`, commit ? { commit: commit.sha, message: commit.title } : {})).data.data;

export const listDeployments = async (uuid: string, page: number) => (await http.get<Page<Deployment>>(`${base(uuid)}/deployments`, { params: { page } })).data;

export const getDeployment = async (uuid: string, id: number) => (await http.get<{ data: Deployment }>(`${base(uuid)}/deployments/${id}`)).data.data;

export const rollback = async (uuid: string, id: number) => (await http.post<{ data: Deployment }>(`${base(uuid)}/deployments/${id}/rollback`)).data.data;

export const listRepositories = async () => (await http.get<{ data: AdminRepository[]; meta: { git_available: boolean } }>('/api/admin/extensions/git-deploy/repositories')).data;

/** The first message for each field a 422 response rejected, keyed by field. */
export function validationErrors(cause: unknown): Record<string, string> {
    const data = (cause as { response?: { status?: number; data?: unknown } } | null)?.response;
    if (data?.status !== 422 || !data.data || typeof data.data !== 'object') return {};

    const errors: Record<string, string> = {};
    const list = (data.data as { errors?: unknown }).errors;
    for (const error of Array.isArray(list) ? list : []) {
        const field = (error as { meta?: { source_field?: unknown } })?.meta?.source_field;
        const detail = (error as { detail?: unknown })?.detail;
        if (typeof field === 'string' && typeof detail === 'string' && !(field in errors)) errors[field] = detail;
    }

    return errors;
}
