import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Label, Select, Switch, TextArea, TitledGreyBox, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { ROOT_KEY, saveRepository, validationErrors } from './api';
import { guessProvider, isSshUrl, parsePaths, tokenHelp } from './present';
import { MASK, type AfterDeploy, type Meta, type Provider, type Repository } from './types';

const AFTER: { value: AfterDeploy; label: string }[] = [
    { value: 'restart', label: 'Restart the server' },
    { value: 'start', label: 'Start the server (if it is off)' },
    { value: 'command', label: 'Send a console command' },
    { value: 'none', label: 'Nothing' },
];

const DEFAULT_SHARED = ['.env', 'node_modules/', 'storage/', 'uploads/'];

function Field({ id, label, error, help, children }: { id: string; label: string; error?: string; help?: string; children: React.ReactNode }) {
    return (
        <div>
            <Label htmlFor={id}>{label}</Label>
            {children}
            {error ? <p className='gd:mt-1 gd:text-xs gd:text-destructive'>{error}</p> : help ? <p className='gd:mt-1 gd:text-xs gd:text-muted-foreground'>{help}</p> : null}
        </div>
    );
}

/** Links the server to a repository, or changes the link: where the code is, which branch, where it goes and what stays. */
export default function RepositoryForm({ uuid, meta, repository, onClose }: { uuid: string; meta: Meta; repository: Repository | null; onClose?: () => void }) {
    const queryClient = useQueryClient();
    const egg = repository ? null : meta.egg;
    const allowed = meta.providers.map((provider) => provider.id);
    const [url, setUrl] = useState(repository?.url ?? egg?.url ?? '');
    const [provider, setProvider] = useState<Provider>(repository?.provider ?? guessProvider(egg?.url ?? ''));
    const [branch, setBranch] = useState(repository?.branch ?? egg?.branch ?? 'main');
    const [directory, setDirectory] = useState(repository?.directory ?? '/');
    const [shared, setShared] = useState((repository?.shared_paths ?? DEFAULT_SHARED).join('\n'));
    const [after, setAfter] = useState<AfterDeploy>(repository?.after_deploy ?? 'restart');
    const [command, setCommand] = useState(repository?.command ?? '');
    const [autoDeploy, setAutoDeploy] = useState(repository?.auto_deploy ?? true);
    const [token, setToken] = useState(repository?.token ?? '');
    const [importToken, setImportToken] = useState(egg?.has_token ?? false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    const ssh = isSshUrl(url);
    const effective: Provider = ssh ? 'generic' : provider;
    const saved = token === MASK;

    const changeUrl = (value: string) => {
        setUrl(value);
        const guessed = guessProvider(value);
        if (!repository && allowed.includes(guessed)) setProvider(guessed);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            await saveRepository(uuid, {
                provider: effective,
                url: url.trim(),
                branch: branch.trim(),
                directory: directory.trim() || '/',
                shared_paths: parsePaths(shared),
                after_deploy: after,
                command: after === 'command' ? command.trim() : null,
                auto_deploy: autoDeploy,
                token: ssh ? null : token,
                import_egg_token: egg !== null && importToken && token === '',
            });
            await queryClient.invalidateQueries({ queryKey: ROOT_KEY });
            toast.success(repository ? 'Repository saved.' : 'Repository linked. Add the webhook to deploy on every push.');
            onClose?.();
        } catch (error) {
            const fields = validationErrors(error);
            setErrors(fields);
            if (Object.keys(fields).length === 0) toast.error(httpErrorToHuman(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={(event) => void submit(event)} className='gd:flex gd:flex-col gd:gap-6'>
            {egg && (
                <Alert type='info' title='This egg already pulls from Git'>
                    Its variables point at {egg.url}
                    {egg.branch ? ` (${egg.branch})` : ''}: the form starts from them.
                    {egg.auto_update && ' Set its AUTO_UPDATE variable to 0 in Startup once linked, so the egg stops pulling on its own at each start.'}
                </Alert>
            )}

            <TitledGreyBox title={repository ? 'Repository' : 'Link a repository'}>
                <div className='gd:flex gd:flex-col gd:gap-4'>
                    <div className='gd:grid gd:grid-cols-1 gd:gap-4 gd:md:grid-cols-3'>
                        <div className='gd:md:col-span-2'>
                            <Field id='gd-url' label='Address' error={errors.url} help='HTTPS (https://github.com/owner/repo) or SSH (git@host:owner/repo.git).'>
                                <Input id='gd-url' $hasError={!!errors.url} value={url} onChange={(event) => changeUrl(event.target.value)} placeholder='https://github.com/owner/repo' spellCheck={false} autoComplete='off' />
                            </Field>
                        </div>
                        <Field id='gd-provider' label='Forge' error={errors.provider} help={ssh ? 'An SSH address goes through git on the panel.' : undefined}>
                            <Select
                                id='gd-provider'
                                value={effective}
                                disabled={ssh}
                                options={meta.providers.map((item) => ({
                                    value: item.id,
                                    label: item.label,
                                    disabled: item.id === 'generic' && !meta.git_available,
                                }))}
                                onChange={(value) => setProvider(value as Provider)}
                            />
                        </Field>
                    </div>
                    <div className='gd:grid gd:grid-cols-1 gd:gap-4 gd:md:grid-cols-3'>
                        <Field id='gd-branch' label='Branch' error={errors.branch}>
                            <Input id='gd-branch' $hasError={!!errors.branch} value={branch} onChange={(event) => setBranch(event.target.value)} spellCheck={false} />
                        </Field>
                        <Field id='gd-directory' label='Folder in the server' error={errors.directory} help='Where the files go: / or a folder such as /app.'>
                            <Input id='gd-directory' $hasError={!!errors.directory} value={directory} onChange={(event) => setDirectory(event.target.value)} spellCheck={false} />
                        </Field>
                        {!ssh && (
                            <Field id='gd-token' label='Access token' error={errors.token} help={egg?.has_token && importToken && token === '' ? 'The egg\'s ACCESS_TOKEN will be used.' : tokenHelp(saved, effective)}>
                                <Input
                                    id='gd-token'
                                    type='password'
                                    autoComplete='new-password'
                                    value={saved ? '' : token}
                                    placeholder={saved ? 'Saved' : ''}
                                    onChange={(event) => setToken(event.target.value)}
                                />
                            </Field>
                        )}
                    </div>
                    {egg?.has_token && !ssh && (
                        <Switch checked={importToken} onChange={setImportToken} label='Use the egg’s access token' description='Copies ACCESS_TOKEN from the egg’s variables, encrypted, when the field above is empty.' />
                    )}
                    {ssh && <p className='gd:text-sm gd:text-muted-foreground'>After saving, generate a deploy key and add it to the repository (read only).</p>}
                    {!meta.git_available && (
                        <p className='gd:text-xs gd:text-muted-foreground'>The panel’s host has no git command: SSH addresses and any Git server are unavailable; GitHub, GitLab and Gitea over HTTPS work.</p>
                    )}
                </div>
            </TitledGreyBox>

            <TitledGreyBox title='Deploys'>
                <div className='gd:flex gd:flex-col gd:gap-4'>
                    <Field
                        id='gd-shared'
                        label='Kept between deploys'
                        error={errors.shared_paths ?? Object.entries(errors).find(([key]) => key.startsWith('shared_paths.'))?.[1]}
                        help='One path per line, inside the folder: files and folders the server owns (configuration, uploads, dependencies, data). A deploy never replaces them; the first one brings them from the repository if the server has none.'
                    >
                        <TextArea id='gd-shared' rows={4} value={shared} onChange={(event) => setShared(event.target.value)} spellCheck={false} className='gd:font-mono gd:text-sm' />
                    </Field>
                    <div className='gd:grid gd:grid-cols-1 gd:gap-4 gd:md:grid-cols-2'>
                        <Field id='gd-after' label='After a deploy' error={errors.after_deploy}>
                            <Select id='gd-after' value={after} options={AFTER} onChange={(value) => setAfter(value as AfterDeploy)} />
                        </Field>
                        {after === 'command' && (
                            <Field id='gd-command' label='Command' error={errors.command} help='Sent to the console, such as reload or a framework’s cache command.'>
                                <Input id='gd-command' $hasError={!!errors.command} value={command} maxLength={191} onChange={(event) => setCommand(event.target.value)} spellCheck={false} />
                            </Field>
                        )}
                    </div>
                    <Switch checked={autoDeploy} onChange={setAutoDeploy} label='Deploy on every push' description='Pushes to the branch, reported by the webhook, deploy at once. Off: the webhook is ignored and deploys are by hand.' />
                </div>
            </TitledGreyBox>

            <div className='gd:flex gd:justify-end gd:gap-3'>
                {onClose && (
                    <Button type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button>
                )}
                <Button type='submit' isLoading={busy} disabled={!url.trim() || !branch.trim()}>
                    {repository ? 'Save' : 'Link the repository'}
                </Button>
            </div>
        </form>
    );
}
