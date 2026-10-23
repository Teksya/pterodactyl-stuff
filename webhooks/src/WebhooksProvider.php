<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use OlivierDutoit\Webhooks\Console\MonitorCommand;
use OlivierDutoit\Webhooks\Console\PruneCommand;
use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use OlivierDutoit\Webhooks\Jobs\ProcessActivity;
use OlivierDutoit\Webhooks\Jobs\ProcessOperation;
use OlivierDutoit\Webhooks\Targets\ProviderRegistry;
use Pterodactyl\Events\ActivityLogged;
use Pterodactyl\Events\Extensions\ExtensionDisabled;
use Pterodactyl\Events\Extensions\ExtensionEnabled;
use Pterodactyl\Events\Extensions\ExtensionInstalled;
use Pterodactyl\Events\Extensions\ExtensionLoadFailed;
use Pterodactyl\Events\Extensions\ExtensionRemoved;
use Pterodactyl\Events\Server\OperationCompleted;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;
use Throwable;

class WebhooksProvider extends ExtensionProvider
{
    public const string ID = 'webhooks';

    public function register(): void
    {
        $this->app->singleton(ProviderRegistry::class);
    }

    public function boot(): void
    {
        // routes/admin.php, routes/server.php (a server's endpoints), routes/client.php (an account's).
        $this->registerApiRoutes();

        $this->registerPermissions('Webhooks of this server.', [
            'read' => 'See the server\'s webhooks and their delivery log.',
            'manage' => 'Create, edit, test and delete the server\'s webhooks (also needs the activity permission).',
        ]);

        $this->registerCommands([MonitorCommand::class, PruneCommand::class]);
        $this->registerSchedule(function (Schedule $schedule): void {
            $schedule->command('webhooks:monitor')->everyMinute()->withoutOverlapping(10);
            $schedule->command('webhooks:prune')->daily();
        });

        $this->listen();
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), $this->settingDefinitions()));
    }

    /**
     * The panel's activity log and lifecycle events. Each listener does nothing unless an
     * endpoint is turned on, and hands the work to the queue once the panel's transaction
     * has committed, so a slow target never slows a request down.
     */
    private function listen(): void
    {
        Event::listen(ActivityLogged::class, function (ActivityLogged $event): void {
            if ($this->active()) {
                ProcessActivity::dispatch((int) $event->model->id)->afterCommit();
            }
        });

        $this->listenToServerOperations(function (OperationCompleted $operation): void {
            if ($this->active()) {
                ProcessOperation::dispatch($operation->serverUuid, $operation->operation, $operation->successful, $operation->resourceUuid);
            }
        });

        $extensionEvents = [
            ExtensionInstalled::class => fn (ExtensionInstalled $e): array => ['extension:installed', sprintf('%s %s was installed.', $e->manifest->name, $e->manifest->version), ['id' => $e->manifest->id, 'version' => $e->manifest->version]],
            ExtensionEnabled::class => fn (ExtensionEnabled $e): array => ['extension:enabled', sprintf('%s %s was enabled.', $e->manifest->name, $e->manifest->version), ['id' => $e->manifest->id, 'version' => $e->manifest->version]],
            ExtensionDisabled::class => fn (ExtensionDisabled $e): array => ['extension:disabled', sprintf('%s %s was disabled.', $e->manifest->name, $e->manifest->version), ['id' => $e->manifest->id, 'version' => $e->manifest->version]],
            ExtensionRemoved::class => fn (ExtensionRemoved $e): array => ['extension:removed', sprintf('The %s extension was removed.', $e->identifier), ['id' => $e->identifier]],
            ExtensionLoadFailed::class => fn (ExtensionLoadFailed $e): array => ['extension:failed', sprintf('The %s extension failed (%s): %s', $e->identifier, $e->phase, $e->reason), ['id' => $e->identifier, 'phase' => $e->phase, 'reason' => $e->reason]],
        ];

        foreach ($extensionEvents as $class => $describe) {
            Event::listen($class, function (object $event) use ($describe): void {
                if (! $this->active() || ($event instanceof ExtensionLoadFailed && $event->identifier === self::ID)) {
                    return;
                }

                // A failing extension fails again on every request: report each failure once an hour.
                if ($event instanceof ExtensionLoadFailed && ! Cache::add('webhooks:extension-failed:'.md5($event->identifier.'|'.$event->phase.'|'.$event->reason), true, 3600)) {
                    return;
                }

                try {
                    [$key, $description, $properties] = $describe($event);
                    $this->app->make(Dispatcher::class)->dispatch($this->app->make(EventBuilder::class)->system($key, $description, $properties));
                } catch (Throwable $exception) {
                    report($exception);
                }
            });
        }
    }

    private function active(): bool
    {
        try {
            return Extensions::isAvailable(self::ID) && Dispatcher::hasEndpoints();
        } catch (Throwable) {
            return false;
        }
    }

    /** @return list<ExtensionSettingDefinition> */
    private function settingDefinitions(): array
    {
        $defaults = Settings::DEFAULTS;

        return [
            ExtensionSettingDefinition::make('server_webhooks', 'server_webhooks', $defaults['server_webhooks'], ['boolean'])
                ->label('Server webhooks')
                ->help('Let server owners, and subusers with the webhook permissions, send their server\'s events to their own webhooks.')
                ->field('toggle')
                ->frontend(),
            ExtensionSettingDefinition::make('account_webhooks', 'account_webhooks', $defaults['account_webhooks'], ['boolean'])
                ->label('Account webhooks')
                ->help('Let every user send their own account\'s events (sign-ins, password and two-factor changes, API keys) to their own webhooks.')
                ->field('toggle')
                ->frontend(),
            ExtensionSettingDefinition::make('max_per_server', 'max_per_server', $defaults['max_per_server'], ['integer', 'min:0', 'max:100'])
                ->label('Webhooks per server')
                ->field('number'),
            ExtensionSettingDefinition::make('max_per_account', 'max_per_account', $defaults['max_per_account'], ['integer', 'min:0', 'max:100'])
                ->label('Webhooks per account')
                ->field('number'),
            ExtensionSettingDefinition::make('providers', 'providers', $defaults['providers'], ['array'])
                ->label('Services users can choose')
                ->help('Server and account webhooks are limited to these. Administrators can always use every one.')
                ->multiselect(ProviderRegistry::options()),
            ExtensionSettingDefinition::make('private_targets', 'private_targets', $defaults['private_targets'], ['boolean'])
                ->label('Allow private addresses')
                ->help('Let server and account webhooks reach private, loopback and link-local addresses (your own network). Leave off unless every user is trusted: it lets them send requests from the panel to internal services.')
                ->field('toggle'),
            ExtensionSettingDefinition::make('timeout', 'timeout', $defaults['timeout'], ['integer', 'min:1', 'max:30'])
                ->label('Request timeout (seconds)')
                ->field('number')
                ->tab('Delivery'),
            ExtensionSettingDefinition::make('max_attempts', 'max_attempts', $defaults['max_attempts'], ['integer', 'min:1', 'max:10'])
                ->label('Attempts per delivery')
                ->help('A failed delivery is retried after 30 seconds, 2 minutes, 10 minutes, 30 minutes, then every hour. Needs the panel\'s queue worker.')
                ->field('number')
                ->tab('Delivery'),
            ExtensionSettingDefinition::make('rate_limit', 'rate_limit', $defaults['rate_limit'], ['integer', 'min:1', 'max:600'])
                ->label('Requests per minute per webhook')
                ->help('Deliveries beyond this wait for the next minute. Discord allows about 30 a minute per webhook.')
                ->field('number')
                ->tab('Delivery'),
            ExtensionSettingDefinition::make('auto_disable', 'auto_disable', $defaults['auto_disable'], ['integer', 'min:0', 'max:1000'])
                ->label('Turn off after failures in a row')
                ->help('A webhook whose deliveries keep failing is turned off after this many; 0 never turns it off.')
                ->field('number')
                ->tab('Delivery'),
            ExtensionSettingDefinition::make('retention_days', 'retention_days', $defaults['retention_days'], ['integer', 'min:1', 'max:365'])
                ->label('Keep the delivery log (days)')
                ->field('number')
                ->tab('Delivery'),
            ExtensionSettingDefinition::make('monitor', 'monitor', $defaults['monitor'], ['boolean'])
                ->label('Monitor servers')
                ->help('Poll the servers a webhook watches for state and resource events (crashes, high CPU, memory or disk). Runs from the panel\'s scheduler.')
                ->field('toggle')
                ->frontend()
                ->tab('Monitoring'),
            ExtensionSettingDefinition::make('monitor_interval', 'monitor_interval', $defaults['monitor_interval'], ['required', 'in:1,2,5,10'])
                ->label('Check every')
                ->field('select', [
                    ['value' => '1', 'label' => 'Minute'],
                    ['value' => '2', 'label' => '2 minutes'],
                    ['value' => '5', 'label' => '5 minutes'],
                    ['value' => '10', 'label' => '10 minutes'],
                ])
                ->tab('Monitoring'),
            ExtensionSettingDefinition::make('cpu_threshold', 'cpu_threshold', $defaults['cpu_threshold'], ['integer', 'min:1', 'max:100'])
                ->label('CPU alert at (% of the limit)')
                ->field('number')
                ->tab('Monitoring'),
            ExtensionSettingDefinition::make('memory_threshold', 'memory_threshold', $defaults['memory_threshold'], ['integer', 'min:1', 'max:100'])
                ->label('Memory alert at (% of the limit)')
                ->field('number')
                ->tab('Monitoring'),
            ExtensionSettingDefinition::make('disk_threshold', 'disk_threshold', $defaults['disk_threshold'], ['integer', 'min:1', 'max:100'])
                ->label('Disk alert at (% of the limit)')
                ->field('number')
                ->tab('Monitoring'),
            ExtensionSettingDefinition::make('node_monitor', 'node_monitor', $defaults['node_monitor'], ['boolean'])
                ->label('Monitor nodes')
                ->help('Ask each node\'s Wings for its system information on every check, for the "Node unreachable" and "Node reachable again" events.')
                ->field('toggle')
                ->tab('Monitoring'),
        ];
    }
}
