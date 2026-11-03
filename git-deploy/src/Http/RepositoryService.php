<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Http;

use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use OlivierDutoit\GitDeploy\Deploy\SshKey;
use OlivierDutoit\GitDeploy\Forges\ForgeException;
use OlivierDutoit\GitDeploy\Forges\Forges;
use OlivierDutoit\GitDeploy\Forges\GenericGit;
use OlivierDutoit\GitDeploy\Forges\RepoUrl;
use OlivierDutoit\GitDeploy\Jobs\RunDeployment;
use OlivierDutoit\GitDeploy\Models\Deployment;
use OlivierDutoit\GitDeploy\Models\Repository;
use OlivierDutoit\GitDeploy\Settings;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** What the server and admin screens share: presenting, saving and deploying a repository. */
final class RepositoryService
{
    /** What a saved secret reads as; sending it back keeps the secret. */
    public const string MASK = '••••••••';

    /** Relative path segments: letters, digits, dots (as in .env), @, + and -; `..` is refused apart. */
    private const string PATH = '/^[\w.@+-]+(\/[\w.@+-]+)*\/?$/';

    /** @return array<string, mixed> */
    public function meta(Server $server, bool $canDeploy, bool $canManage): array
    {
        $repository = Repository::query()->where('server_id', $server->id)->first();

        return [
            'providers' => array_values(array_map(
                fn (string $id): array => ['id' => $id, 'label' => Forges::LABELS[$id]],
                array_values(array_filter(Settings::providers(), fn (string $id): bool => isset(Forges::LABELS[$id]))),
            )),
            'git_available' => GenericGit::available(),
            'keep_releases' => Settings::int('keep_releases', 1, 20),
            'can_deploy' => $canDeploy,
            'can_manage' => $canManage,
            'repository' => $repository !== null ? $this->present($repository, $canManage) : null,
            'egg' => $repository === null ? self::eggGit($server) : null,
        ];
    }

    /** @return array<string, mixed> */
    public function present(Repository $repository, bool $withSecrets): array
    {
        $last = $repository->deployments()->latest('id')->first();

        return [
            'uuid' => $repository->uuid,
            'provider' => $repository->provider,
            'url' => $repository->url,
            'branch' => $repository->branch,
            'directory' => $repository->root(),
            'shared_paths' => $repository->shared_paths ?? [],
            'after_deploy' => $repository->after_deploy,
            'command' => $repository->command,
            'auto_deploy' => $repository->auto_deploy,
            'current_release' => $repository->current_release,
            'token' => $repository->secret('token') !== null ? self::MASK : null,
            'ssh_public_key' => $repository->ssh_public_key,
            'webhook_url' => url('/extensions/git-deploy/hooks/'.$repository->uuid),
            'webhook_secret' => $withSecrets ? $repository->secret('webhook_secret') : null,
            'last_deployment' => $last !== null ? $this->deployment($last, $repository) : null,
        ];
    }

    /** @return array<string, mixed> */
    public function deployment(Deployment $deployment, ?Repository $repository = null, bool $withLog = false): array
    {
        $repository ??= $deployment->repository;

        return [
            'id' => $deployment->id,
            'uuid' => $deployment->uuid,
            'branch' => $deployment->branch,
            'commit' => $deployment->commit,
            'message' => $deployment->message,
            'author' => $deployment->author,
            'trigger' => $deployment->trigger,
            'status' => $deployment->status,
            'release' => $deployment->release,
            'current' => $deployment->release !== null && $deployment->release === $repository->current_release,
            'user' => $deployment->creator?->username,
            'created_at' => $deployment->created_at->toAtomString(),
            'started_at' => $deployment->started_at?->toAtomString(),
            'finished_at' => $deployment->finished_at?->toAtomString(),
            'log' => $withLog ? ($deployment->log ?? '') : null,
        ];
    }

    public function save(Server $server, Request $request, User $actor): Repository
    {
        $data = $request->validate([
            'provider' => ['required', 'string'],
            'url' => ['required', 'string', 'max:500'],
            'branch' => ['required', 'string', 'max:191', 'regex:/^[\w.\/-]+$/'],
            'directory' => ['required', 'string', 'max:191'],
            'shared_paths' => ['present', 'array', 'max:30'],
            'shared_paths.*' => ['string', 'max:191'],
            'after_deploy' => ['required', 'in:'.implode(',', Repository::AFTER_DEPLOY)],
            'command' => ['nullable', 'string', 'max:191', 'required_if:after_deploy,command'],
            'auto_deploy' => ['required', 'boolean'],
            'token' => ['nullable', 'string', 'max:500'],
            'import_egg_token' => ['sometimes', 'boolean'],
        ]);

        $provider = (string) $data['provider'];
        if (! in_array($provider, Settings::providers(), true) || ! isset(Forges::LABELS[$provider])) {
            throw ValidationException::withMessages(['provider' => 'The administrator does not allow this forge.']);
        }
        try {
            $url = RepoUrl::parse((string) $data['url']);
        } catch (ForgeException $exception) {
            throw ValidationException::withMessages(['url' => $exception->getMessage()]);
        }
        if (($provider === 'generic' || $url->ssh) && ! GenericGit::available()) {
            throw ValidationException::withMessages(['url' => 'This address needs git on the panel\'s host, which it does not have: use an HTTPS address with GitHub, GitLab or Gitea.']);
        }
        if ($url->ssh && $provider !== 'generic') {
            $provider = 'generic';
        }

        $directory = trim((string) $data['directory']);
        if ($directory !== '/' && (! preg_match(self::PATH, ltrim($directory, '/')) || in_array('..', explode('/', $directory), true))) {
            throw ValidationException::withMessages(['directory' => 'A folder of the server, such as / or /app.']);
        }
        $shared = [];
        foreach ($data['shared_paths'] as $index => $path) {
            $path = trim((string) $path);
            if ($path === '') {
                continue;
            }
            $segments = explode('/', rtrim($path, '/'));
            if (! preg_match(self::PATH, $path) || in_array('..', $segments, true) || in_array('.', $segments, true) || $segments[0] === '.deploy') {
                throw ValidationException::withMessages(["shared_paths.{$index}" => "\"{$path}\" is not a path inside the folder, such as .env or storage/ (letters, digits, dots, @, + and -; no .. and not .deploy)."]);
            }
            $shared[] = $path;
        }
        $command = isset($data['command']) ? trim(str_replace(["\r", "\n"], ' ', (string) $data['command'])) : null;

        $repository = Repository::query()->firstOrNew(['server_id' => $server->id]);
        $secrets = $repository->secrets ?? [];
        $token = $data['token'] ?? null;
        if ($token !== self::MASK) {
            $secrets['token'] = is_string($token) && trim($token) !== '' ? trim($token) : null;
        }
        if ($request->boolean('import_egg_token')) {
            $secrets['token'] = self::eggVariable($server, ['ACCESS_TOKEN', 'GIT_TOKEN']) ?? $secrets['token'] ?? null;
        }
        $secrets['webhook_secret'] ??= Str::random(40);

        $repository->forceFill([
            'uuid' => $repository->uuid ?? (string) Str::uuid(),
            'provider' => $provider,
            'url' => trim((string) $data['url']),
            'branch' => (string) $data['branch'],
            'directory' => $directory === '/' ? '/' : '/'.trim($directory, '/'),
            'shared_paths' => array_values(array_unique($shared)),
            'after_deploy' => (string) $data['after_deploy'],
            'command' => $data['after_deploy'] === 'command' ? $command : null,
            'auto_deploy' => (bool) $data['auto_deploy'],
            'secrets' => $secrets,
            'created_by' => $repository->created_by ?? $actor->id,
        ])->save();

        return $repository;
    }

    /** A new deploy key; the repository needs it added (read-only) before deploying over SSH. */
    public function generateKey(Repository $repository): string
    {
        try {
            $key = SshKey::generate('pterodactyl-'.$repository->server->uuidShort);
        } catch (ForgeException $exception) {
            throw ValidationException::withMessages(['ssh' => $exception->getMessage()]);
        }
        $repository->forceFill(['secrets' => [...($repository->secrets ?? []), 'ssh_private_key' => $key['private']], 'ssh_public_key' => $key['public']])->save();

        return $key['public'];
    }

    public function rotateSecret(Repository $repository): void
    {
        $repository->forceFill(['secrets' => [...($repository->secrets ?? []), 'webhook_secret' => Str::random(40)]])->save();
    }

    /** Queues a deploy of `$commit` (or of the branch's last commit) and returns it. */
    public function deploy(Repository $repository, string $trigger, ?User $actor, ?string $commit = null, ?string $message = null, ?string $author = null): Deployment
    {
        $deployment = Deployment::query()->create([
            'uuid' => (string) Str::uuid(),
            'repository_id' => $repository->id,
            'server_id' => $repository->server_id,
            'branch' => $repository->branch,
            'commit' => $commit,
            'message' => $message !== null ? mb_substr(trim((string) strtok($message, "\n")), 0, 500) : null,
            'author' => $author !== null ? mb_substr($author, 0, 191) : null,
            'trigger' => $trigger,
            'status' => Deployment::QUEUED,
            'created_by' => $actor?->id,
        ]);
        $deployment->line(match ($trigger) {
            'push' => 'Queued by a push'.($author ? " from {$author}" : '').'.',
            default => 'Queued by '.($actor?->username ?? 'the panel').'.',
        });

        RunDeployment::dispatch($deployment->id)->afterCommit();

        return $deployment;
    }

    /** Queues a rollback to the release a past deploy made. */
    public function rollback(Repository $repository, Deployment $target, User $actor): Deployment
    {
        if ($target->status !== Deployment::SUCCESS || $target->release === null || $target->release === $repository->current_release) {
            throw ValidationException::withMessages(['deployment' => 'Only a past successful deploy, other than the current one, can be rolled back to.']);
        }

        $deployment = Deployment::query()->create([
            'uuid' => (string) Str::uuid(),
            'repository_id' => $repository->id,
            'server_id' => $repository->server_id,
            'branch' => $target->branch,
            'commit' => $target->commit,
            'message' => $target->message,
            'author' => $target->author,
            'trigger' => 'rollback',
            'status' => Deployment::QUEUED,
            'created_by' => $actor->id,
        ]);
        $deployment->line("Queued by {$actor->username}: rollback to {$target->release}.");

        RunDeployment::dispatch($deployment->id, $target->release)->afterCommit();

        return $deployment;
    }

    /**
     * The repository a community egg's variables point at (GIT_ADDRESS, BRANCH, ACCESS_TOKEN,
     * AUTO_UPDATE), to fill in the form. The token itself never leaves the panel.
     *
     * @return array{url: string, branch: string|null, has_token: bool, auto_update: bool}|null
     */
    public static function eggGit(Server $server): ?array
    {
        $url = self::eggVariable($server, ['GIT_ADDRESS', 'GIT_REPO', 'GIT_URL', 'REPO_URL']);
        if ($url === null) {
            return null;
        }

        return [
            'url' => $url,
            'branch' => self::eggVariable($server, ['BRANCH', 'GIT_BRANCH']),
            'has_token' => self::eggVariable($server, ['ACCESS_TOKEN', 'GIT_TOKEN']) !== null,
            'auto_update' => self::eggVariable($server, ['AUTO_UPDATE']) === '1',
        ];
    }

    /** @param  list<string>  $names */
    private static function eggVariable(Server $server, array $names): ?string
    {
        foreach ($server->resolvedVariables() as $variable) {
            if (in_array($variable->env_variable, $names, true)) {
                $value = trim((string) ($variable->server_value ?? $variable->default_value ?? ''));
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }
}
