import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, GitBranch, KeyRound, Rocket, Settings2, Unlink, Webhook } from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    CopyOnClick,
    Dialog,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    ServerContentBlock,
    Spinner,
    TitledGreyBox,
    fromNow,
    httpErrorToHuman,
    toast,
    useCurrentServerUuid,
    type ScreenComponentProps,
} from '@pterodactyl/sdk';
import { deploy, generateKey, getMeta, keys, listCommits, rotateSecret, ROOT_KEY, unlinkRepository, validationErrors } from './api';
import Deployments from './Deployments';
import { isSshUrl, shortSha, statusOf, webhookSteps } from './present';
import RepositoryForm from './RepositoryForm';
import type { Commit, Meta, Repository } from './types';

const AFTER_LABEL = { restart: 'restarts the server', start: 'starts the server', command: 'sends a command', none: 'leaves the server as it is' } as const;

/** Picks the commit to deploy: the branch's last one by default, or one of the commits before it. */
function DeployDialog({ uuid, repository, onClose }: { uuid: string; repository: Repository; onClose: () => void }) {
    const queryClient = useQueryClient();
    const commits = useQuery({ queryKey: keys.commits(uuid), queryFn: () => listCommits(uuid), retry: false, staleTime: 10_000 });
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const selected = commits.data?.find((commit) => commit.sha === chosen) ?? commits.data?.[0];

    const run = async () => {
        setBusy(true);
        try {
            const deployment = await deploy(uuid, selected);
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(`Deploying ${shortSha(deployment.commit ?? selected?.sha ?? null)}…`);
            onClose();
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    const error = commits.isError ? (validationErrors(commits.error).repository ?? httpErrorToHuman(commits.error)) : null;

    return (
        <Dialog open onClose={() => !busy && onClose()} title={`Deploy ${repository.branch}`} description={`Then the panel ${AFTER_LABEL[repository.after_deploy]}.`}>
            {commits.isPending ? (
                <Spinner centered />
            ) : error ? (
                <Alert type='danger'>{error}</Alert>
            ) : (
                <ul className='gd:flex gd:max-h-80 gd:flex-col gd:gap-1 gd:overflow-auto' role='radiogroup' aria-label='Commit'>
                    {(commits.data ?? []).map((commit: Commit, index) => (
                        <li key={commit.sha}>
                            <button
                                type='button'
                                role='radio'
                                aria-checked={selected?.sha === commit.sha}
                                onClick={() => setChosen(commit.sha)}
                                className={`gd:flex gd:w-full gd:items-start gd:gap-3 gd:rounded-md gd:border gd:px-3 gd:py-2 gd:text-left gd:transition-colors ${selected?.sha === commit.sha ? 'gd:border-primary gd:bg-primary/10' : 'gd:border-transparent gd:hover:bg-accent'}`}
                            >
                                <code className='gd:mt-0.5 gd:font-mono gd:text-xs'>{shortSha(commit.sha)}</code>
                                <span className='gd:min-w-0 gd:flex-1'>
                                    <span className='gd:block gd:truncate gd:text-sm'>{commit.title || (index === 0 ? `Last commit of ${repository.branch}` : commit.sha)}</span>
                                    <span className='gd:block gd:text-xs gd:text-muted-foreground'>
                                        {[commit.author, commit.date ? fromNow(commit.date) : null, index === 0 ? 'latest' : null].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Dialog.Footer>
                <Button type='button' isSecondary onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type='button' isLoading={busy} disabled={!selected} onClick={() => void run()}>
                    <Rocket className='gd:size-4' aria-hidden />
                    Deploy
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}

/** The webhook URL and secret to paste in the forge, with its steps; and the deploy key for SSH addresses. */
function Connection({ uuid, repository }: { uuid: string; repository: Repository }) {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState<'key' | 'secret' | null>(null);
    const ssh = isSshUrl(repository.url);

    const act = async (what: 'key' | 'secret') => {
        setBusy(what);
        try {
            if (what === 'key') await generateKey(uuid);
            else await rotateSecret(uuid);
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(what === 'key' ? 'Deploy key generated: add it to the repository.' : 'New secret: update it in the forge’s webhook.');
        } catch (error) {
            toast.error(validationErrors(error).ssh ?? httpErrorToHuman(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className='gd:grid gd:grid-cols-1 gd:gap-6 gd:lg:grid-cols-2'>
            <TitledGreyBox title='Webhook' icon={Webhook}>
                <ol className='gd:mb-3 gd:list-decimal gd:space-y-1 gd:pl-5 gd:text-sm gd:text-muted-foreground'>
                    {webhookSteps(repository.provider).map((step) => (
                        <li key={step}>{step}</li>
                    ))}
                </ol>
                <p className='gd:text-xs gd:font-medium gd:text-muted-foreground'>URL</p>
                <CopyOnClick text={repository.webhook_url}>
                    <code className='gd:block gd:break-all gd:rounded gd:bg-muted gd:px-2 gd:py-1 gd:font-mono gd:text-xs'>{repository.webhook_url}</code>
                </CopyOnClick>
                <p className='gd:mt-2 gd:text-xs gd:font-medium gd:text-muted-foreground'>Secret</p>
                {repository.webhook_secret ? (
                    <CopyOnClick text={repository.webhook_secret}>
                        <code className='gd:block gd:break-all gd:rounded gd:bg-muted gd:px-2 gd:py-1 gd:font-mono gd:text-xs'>{repository.webhook_secret}</code>
                    </CopyOnClick>
                ) : (
                    <p className='gd:text-xs gd:text-muted-foreground'>Shown to those who manage the repository.</p>
                )}
                {repository.webhook_secret && (
                    <Button.Text size='small' className='gd:mt-2' isLoading={busy === 'secret'} onClick={() => void act('secret')}>
                        New secret
                    </Button.Text>
                )}
                {!repository.auto_deploy && <p className='gd:mt-2 gd:text-xs gd:text-warning'>Deploying on push is off: the webhook is ignored.</p>}
            </TitledGreyBox>
            {ssh && (
                <TitledGreyBox title='Deploy key' icon={KeyRound}>
                    {repository.ssh_public_key ? (
                        <>
                            <p className='gd:mb-2 gd:text-sm gd:text-muted-foreground'>Add this key to the repository as a read-only deploy key (GitHub: Settings → Deploy keys; GitLab: Settings → Repository → Deploy keys; Gitea: Settings → Deploy keys).</p>
                            <CopyOnClick text={repository.ssh_public_key}>
                                <code className='gd:block gd:break-all gd:rounded gd:bg-muted gd:px-2 gd:py-1 gd:font-mono gd:text-xs'>{repository.ssh_public_key}</code>
                            </CopyOnClick>
                        </>
                    ) : (
                        <p className='gd:mb-2 gd:text-sm gd:text-muted-foreground'>An SSH address needs a deploy key: the panel generates one and keeps its private half encrypted.</p>
                    )}
                    {repository.webhook_secret !== null && (
                        <Button size='small' isSecondary className='gd:mt-3' isLoading={busy === 'key'} onClick={() => void act('key')}>
                            <KeyRound className='gd:size-4' aria-hidden />
                            {repository.ssh_public_key ? 'Generate a new key' : 'Generate a deploy key'}
                        </Button>
                    )}
                </TitledGreyBox>
            )}
        </div>
    );
}

function Overview({ uuid, meta, repository, onEdit }: { uuid: string; meta: Meta; repository: Repository; onEdit: () => void }) {
    const queryClient = useQueryClient();
    const [deploying, setDeploying] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [busy, setBusy] = useState(false);
    const last = repository.last_deployment;
    const provider = meta.providers.find((item) => item.id === repository.provider)?.label ?? repository.provider;
    const web = repository.url.startsWith('http') ? repository.url.replace(/\.git$/, '') : null;

    return (
        <div className='gd:flex gd:flex-col gd:gap-6'>
            <TitledGreyBox title='Repository' icon={GitBranch}>
                <div className='gd:flex gd:flex-col gd:gap-4 gd:md:flex-row gd:md:items-start gd:md:justify-between'>
                    <div className='gd:min-w-0 gd:space-y-1'>
                        <p className='gd:flex gd:flex-wrap gd:items-center gd:gap-2'>
                            <span className='gd:break-all gd:font-medium'>{repository.url}</span>
                            {web && (
                                <a href={web} target='_blank' rel='noopener noreferrer' aria-label='Open the repository' className='gd:text-muted-foreground gd:hover:text-foreground'>
                                    <ExternalLink className='gd:size-4' />
                                </a>
                            )}
                        </p>
                        <p className='gd:flex gd:flex-wrap gd:gap-1.5'>
                            <Badge size='sm' variant='soft' tone='neutral'>
                                {provider}
                            </Badge>
                            <Badge size='sm' variant='soft' tone='neutral'>
                                {repository.branch}
                            </Badge>
                            <Badge size='sm' variant='soft' tone='neutral'>
                                into {repository.directory}
                            </Badge>
                            {repository.auto_deploy && (
                                <Badge size='sm' variant='soft' tone='info'>
                                    on push
                                </Badge>
                            )}
                        </p>
                        <p className='gd:text-sm gd:text-muted-foreground'>
                            {last ? (
                                <>
                                    Last deploy: <code className='gd:font-mono'>{shortSha(last.commit)}</code> {last.message ? `“${last.message}”` : ''} · {statusOf(last.status).label.toLowerCase()} · {fromNow(last.created_at)}
                                </>
                            ) : (
                                'Never deployed.'
                            )}
                        </p>
                        {repository.shared_paths.length > 0 && <p className='gd:text-xs gd:text-muted-foreground'>Kept: {repository.shared_paths.join(', ')}</p>}
                    </div>
                    <div className='gd:flex gd:shrink-0 gd:flex-wrap gd:gap-2'>
                        {meta.can_manage && (
                            <>
                                <Button size='small' isSecondary onClick={onEdit}>
                                    <Settings2 className='gd:size-4' aria-hidden />
                                    Settings
                                </Button>
                                <Button size='small' isSecondary onClick={() => setUnlinking(true)}>
                                    <Unlink className='gd:size-4' aria-hidden />
                                    Unlink
                                </Button>
                            </>
                        )}
                        {meta.can_deploy && (
                            <Button size='small' onClick={() => setDeploying(true)}>
                                <Rocket className='gd:size-4' aria-hidden />
                                Deploy now
                            </Button>
                        )}
                    </div>
                </div>
            </TitledGreyBox>

            {meta.can_manage && <Connection uuid={uuid} repository={repository} />}

            <TitledGreyBox title='Deploys'>
                <p className='gd:mb-3 gd:text-sm gd:text-muted-foreground'>The {meta.keep_releases} previous deploys stay in .deploy/releases/ in the folder, to roll back in one click.</p>
                <Deployments uuid={uuid} canDeploy={meta.can_deploy} />
            </TitledGreyBox>

            {deploying && <DeployDialog uuid={uuid} repository={repository} onClose={() => setDeploying(false)} />}
            <Dialog.Confirm
                open={unlinking}
                onClose={() => setUnlinking(false)}
                title='Unlink the repository'
                confirm='Unlink'
                pending={busy}
                onConfirmed={async () => {
                    setBusy(true);
                    try {
                        await unlinkRepository(uuid);
                        await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
                        toast.success('Repository unlinked.');
                    } catch (error) {
                        toast.error(httpErrorToHuman(error));
                    }
                    setBusy(false);
                    setUnlinking(false);
                }}
            >
                The server keeps its files and .deploy/releases/; the deploy history, the token, the deploy key and the webhook are deleted.
            </Dialog.Confirm>
        </div>
    );
}

/** Server → Deploy. */
export default function DeployScreen(_props: ScreenComponentProps) {
    const uuid = useCurrentServerUuid() ?? '';
    const meta = useQuery({ queryKey: keys.meta(uuid), queryFn: () => getMeta(uuid), enabled: uuid !== '' });
    const [editing, setEditing] = useState(false);

    return (
        <ServerContentBlock title='Deploy'>
            {!meta.data ? (
                meta.isError ? (
                    <Alert type='danger'>{httpErrorToHuman(meta.error)}</Alert>
                ) : (
                    <Spinner size='large' centered />
                )
            ) : !meta.data.repository ? (
                meta.data.can_manage ? (
                    <RepositoryForm uuid={uuid} meta={meta.data} repository={null} />
                ) : (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant='icon'>
                                <GitBranch />
                            </EmptyMedia>
                            <EmptyTitle>No repository</EmptyTitle>
                            <EmptyDescription>Someone who manages this server’s deploys links it to a Git repository here.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )
            ) : editing ? (
                <RepositoryForm uuid={uuid} meta={meta.data} repository={meta.data.repository} onClose={() => setEditing(false)} />
            ) : (
                <Overview uuid={uuid} meta={meta.data} repository={meta.data.repository} onEdit={() => setEditing(true)} />
            )}
        </ServerContentBlock>
    );
}
