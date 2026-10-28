<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Event;
use OlivierDutoit\Subdomains\Console\SyncCommand;
use OlivierDutoit\Subdomains\Dns\Cloudflare;
use OlivierDutoit\Subdomains\Dns\DnsProvider;
use OlivierDutoit\Subdomains\Jobs\DeleteRecords;
use OlivierDutoit\Subdomains\Jobs\SyncSubdomains;
use OlivierDutoit\Subdomains\Models\Subdomain;
use Pterodactyl\Events\Server\Deleting;
use Pterodactyl\Events\Server\Updated;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;
use Throwable;

class SubdomainsProvider extends ExtensionProvider
{
    public const string ID = 'subdomains';

    public const string LABEL = '/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/';

    public function register(): void
    {
        $this->app->bind(DnsProvider::class, fn (): DnsProvider => new Cloudflare(Settings::token(), Settings::int('ttl', 1, 86400)));
    }

    public function boot(): void
    {
        // routes/admin.php, routes/server.php.
        $this->registerApiRoutes();

        $this->registerPermissions('Subdomains of this server.', [
            'read' => 'See the server\'s subdomains.',
            'manage' => 'Create, change and delete the server\'s subdomains.',
        ]);

        $this->registerCommands([SyncCommand::class]);
        $this->registerSchedule(function (Schedule $schedule): void {
            $schedule->command('subdomains:sync')->daily()->withoutOverlapping(60);
        });

        $this->listen();
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), $this->settingDefinitions()));
    }

    /** A deleted server takes its records with it; a new allocation or egg rewrites them. */
    private function listen(): void
    {
        Event::listen(Deleting::class, function (Deleting $event): void {
            if (! $this->active()) {
                return;
            }

            $records = Subdomain::query()->where('server_id', $event->server->id)->get()
                ->flatMap(fn (Subdomain $subdomain): array => $subdomain->recordRefs())
                ->values()
                ->all();

            if ($records !== []) {
                DeleteRecords::dispatch($records)->afterCommit();
            }
        });

        Event::listen(Updated::class, function (Updated $event): void {
            if (! $this->active() || ! $event->server->wasChanged(['allocation_id', 'egg_id', 'startup', 'image'])) {
                return;
            }

            $ids = Subdomain::query()->where('server_id', $event->server->id)
                ->when(! $event->server->wasChanged(['egg_id', 'startup', 'image']), fn ($query) => $query->whereNull('allocation_id'))
                ->pluck('id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all();

            if ($ids !== []) {
                SyncSubdomains::dispatch($ids)->afterCommit();
            }
        });
    }

    private function active(): bool
    {
        try {
            return Extensions::isAvailable(self::ID) && Settings::token() !== '';
        } catch (Throwable) {
            return false;
        }
    }

    /** @return list<ExtensionSettingDefinition> */
    private function settingDefinitions(): array
    {
        $defaults = Settings::DEFAULTS;

        return [
            ExtensionSettingDefinition::make('server_subdomains', 'server_subdomains', $defaults['server_subdomains'], ['boolean'])
                ->label('Let users make subdomains')
                ->help('Server owners, and subusers with the subdomain permissions, take names for their servers. Turned off, only administrators do, from a server\'s Subdomains tab.')
                ->field('toggle')
                ->frontend(),
            ExtensionSettingDefinition::make('domains', 'domains', $defaults['domains'], ['array'])
                ->label('Domains')
                ->help('The domains names are taken under, such as example.com or play.example.com. Each must be in a Cloudflare zone the token can edit.')
                ->list(['max:191', 'regex:/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\.?$/'], 20),
            ExtensionSettingDefinition::make('max_per_server', 'max_per_server', $defaults['max_per_server'], ['integer', 'min:0', 'max:20'])
                ->label('Subdomains per server')
                ->help('Administrators are not limited.')
                ->field('number'),
            ExtensionSettingDefinition::make('min_length', 'min_length', $defaults['min_length'], ['integer', 'min:1', 'max:20'])
                ->label('Shortest name')
                ->field('number'),
            ExtensionSettingDefinition::make('reserved', 'reserved', $defaults['reserved'], ['array'])
                ->label('Reserved names')
                ->help('Names nobody can take, administrators included.')
                ->list(['max:63'], 200),
            ExtensionSettingDefinition::make('api_token', 'api_token', $defaults['api_token'], ['nullable', 'string', 'max:255'])
                ->label('API token')
                ->help('A Cloudflare API token (My Profile → API Tokens) with Zone → DNS → Edit and Zone → Zone → Read on the domains\' zones.')
                ->field('password')
                ->tab('Cloudflare'),
            ExtensionSettingDefinition::make('ttl', 'ttl', $defaults['ttl'], ['required', 'in:1,60,300,3600'])
                ->label('Record TTL')
                ->field('select', [
                    ['value' => '1', 'label' => 'Automatic'],
                    ['value' => '60', 'label' => '1 minute'],
                    ['value' => '300', 'label' => '5 minutes'],
                    ['value' => '3600', 'label' => '1 hour'],
                ])
                ->tab('Cloudflare'),
            ExtensionSettingDefinition::make('srv_overrides', 'srv_overrides', $defaults['srv_overrides'], ['nullable', 'string', 'max:5000'])
                ->label('SRV record per egg')
                ->help('One line per egg, by name or id: "My game: _mygame._udp" adds an SRV record for it, "Paper: none" removes it. Minecraft Java, TeamSpeak 3 and Mumble get theirs without a line.')
                ->textarea(5000)
                ->tab('Records'),
        ];
    }
}
