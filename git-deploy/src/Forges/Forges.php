<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use OlivierDutoit\GitDeploy\Models\Repository;

/** The forges a repository can live on, and the one for a repository. */
final class Forges
{
    public const array LABELS = [
        'github' => 'GitHub',
        'gitlab' => 'GitLab',
        'gitea' => 'Gitea / Forgejo',
        'generic' => 'Any Git server',
    ];

    /** @throws ForgeException */
    public static function for(Repository $repository): Forge
    {
        $url = RepoUrl::parse($repository->url);
        $token = $repository->secret('token');

        if ($repository->provider === 'generic' || $url->ssh) {
            return new GenericGit($url, $token, $repository->secret('ssh_private_key'), $repository->branch);
        }

        return match ($repository->provider) {
            'github' => new GitHub($url, $token),
            'gitlab' => new GitLab($url, $token),
            'gitea' => new Gitea($url, $token),
            default => throw new ForgeException('Unknown forge.'),
        };
    }

    /** The forge an address most likely belongs to, to fill in the form. */
    public static function guess(string $url): string
    {
        try {
            $parsed = RepoUrl::parse($url);
        } catch (ForgeException) {
            return 'generic';
        }

        return match (true) {
            $parsed->ssh => 'generic',
            $parsed->host === 'github.com' || str_contains($parsed->host, 'github') => 'github',
            $parsed->host === 'gitlab.com' || str_contains($parsed->host, 'gitlab') => 'gitlab',
            in_array($parsed->host, ['codeberg.org', 'gitea.com'], true) || str_contains($parsed->host, 'gitea') || str_contains($parsed->host, 'forgejo') => 'gitea',
            default => 'generic',
        };
    }
}
