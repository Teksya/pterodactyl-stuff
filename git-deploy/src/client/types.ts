export type Provider = 'github' | 'gitlab' | 'gitea' | 'generic';
export type AfterDeploy = 'restart' | 'start' | 'command' | 'none';
export type Status = 'queued' | 'running' | 'success' | 'failed';
export type Trigger = 'manual' | 'push' | 'rollback';

/** What a saved token reads as; sending it back keeps it. */
export const MASK = '••••••••';

export interface Deployment {
    id: number;
    uuid: string;
    branch: string;
    commit: string | null;
    message: string | null;
    author: string | null;
    trigger: Trigger;
    status: Status;
    release: string | null;
    /** Its files are the ones in place now. */
    current: boolean;
    user: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    log: string | null;
}

export interface Repository {
    uuid: string;
    provider: Provider;
    url: string;
    branch: string;
    directory: string;
    shared_paths: string[];
    after_deploy: AfterDeploy;
    command: string | null;
    auto_deploy: boolean;
    current_release: string | null;
    token: string | null;
    ssh_public_key: string | null;
    webhook_url: string;
    webhook_secret: string | null;
    last_deployment: Deployment | null;
}

export interface Meta {
    providers: { id: Provider; label: string }[];
    git_available: boolean;
    keep_releases: number;
    can_deploy: boolean;
    can_manage: boolean;
    repository: Repository | null;
    /** The repository a community egg's variables point at. */
    egg: { url: string; branch: string | null; has_token: boolean; auto_update: boolean } | null;
}

export interface RepositoryInput {
    provider: Provider;
    url: string;
    branch: string;
    directory: string;
    shared_paths: string[];
    after_deploy: AfterDeploy;
    command: string | null;
    auto_deploy: boolean;
    token: string | null;
    import_egg_token?: boolean;
}

export interface Commit {
    sha: string;
    title: string;
    author: string;
    date: string | null;
    url: string | null;
}

export interface Page<T> {
    data: T[];
    meta: { page: number; pages: number; total: number };
}

export interface AdminRepository extends Repository {
    server: { id: number; name: string; identifier: string; uuid: string };
}
