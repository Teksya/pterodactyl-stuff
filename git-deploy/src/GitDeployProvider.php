<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy;

use OlivierDutoit\GitDeploy\Forges\Forges;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class GitDeployProvider extends ExtensionProvider
{
    public const string ID = 'git-deploy';

    public function boot(): void
    {
        // routes/server.php, routes/admin.php, and the webhook in routes/web.php.
        $this->registerApiRoutes();
        $this->registerWebRoutes($this->extensionPath('routes', 'web.php'));

        $this->registerPermissions('Deploys of this server from a Git repository.', [
            'read' => 'See the repository and the deploys, with their logs.',
            'deploy' => 'Deploy a commit and roll back to an earlier deploy.',
            'manage' => 'Link the server to a repository and change its settings, token and deploy key: it decides what code the server runs.',
        ]);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), $this->settingDefinitions()));
    }

    /** @return list<ExtensionSettingDefinition> */
    private function settingDefinitions(): array
    {
        $defaults = Settings::DEFAULTS;

        return [
            ExtensionSettingDefinition::make('providers', 'providers', $defaults['providers'], ['array'])
                ->label('Forges users can deploy from')
                ->help('Any Git server needs the git command on the panel\'s host.')
                ->multiselect(array_map(fn (string $id, string $label): array => ['value' => $id, 'label' => $label], array_keys(Forges::LABELS), array_values(Forges::LABELS))),
            ExtensionSettingDefinition::make('private_hosts', 'private_hosts', $defaults['private_hosts'], ['boolean'])
                ->label('Allow forges on private networks')
                ->help('Let repositories live on private, loopback and link-local addresses, such as a GitLab or Gitea on your own network. Leave off unless every user who can link a repository is trusted: it lets them make the panel send requests to internal services.')
                ->field('toggle'),
            ExtensionSettingDefinition::make('max_archive_mb', 'max_archive_mb', $defaults['max_archive_mb'], ['integer', 'min:1', 'max:2048'])
                ->label('Largest deploy (MB)')
                ->help('A commit\'s files, compressed. Wings also limits uploads (api.upload_limit, 100 MB by default).')
                ->field('number'),
            ExtensionSettingDefinition::make('keep_releases', 'keep_releases', $defaults['keep_releases'], ['integer', 'min:1', 'max:20'])
                ->label('Releases kept for rollback')
                ->help('Earlier deploys kept in each server\'s .deploy/releases folder; they count toward its disk.')
                ->field('number'),
        ];
    }
}
