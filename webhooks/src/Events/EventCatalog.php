<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Events;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Scope;

/**
 * Every event endpoints can subscribe to: the panel's activity log entries (the keys of
 * resources/lang/en/activity.php), the results of server operations, the monitor's state and
 * resource alerts, node reachability and extension lifecycle changes. Activity entries other
 * extensions log under their own keys are delivered too, to endpoints whose patterns match
 * them, under the "Other" group.
 */
final class EventCatalog
{
    /** Sent by the Test button, whatever the endpoint subscribes to. */
    public const string TEST = 'webhook:test';

    private const array SERVER = [Scope::Admin, Scope::Server];

    private const array ACCOUNT = [Scope::Admin, Scope::Account];

    private const array ADMIN = [Scope::Admin];

    /**
     * Group id => [label, scopes, [event key => [label, severity]]].
     *
     * @var array<string, array{0: string, 1: list<Scope>, 2: array<string, array{0: string, 1: Severity}>}>
     */
    private const array GROUPS = [
        'server.power' => ['Power', self::SERVER, [
            'server:power.start' => ['Server started', Severity::Success],
            'server:power.stop' => ['Server stopped', Severity::Warning],
            'server:power.restart' => ['Server restarted', Severity::Info],
            'server:power.kill' => ['Server killed', Severity::Warning],
        ]],
        'server.status' => ['Status and resources', self::SERVER, [
            'server:state.running' => ['Server is running', Severity::Success],
            'server:state.offline' => ['Server went offline', Severity::Warning],
            'server:state.crashed' => ['Server stopped unexpectedly', Severity::Danger],
            'server:resources.cpu' => ['CPU usage high', Severity::Warning],
            'server:resources.memory' => ['Memory usage high', Severity::Warning],
            'server:resources.disk' => ['Disk usage high', Severity::Warning],
        ]],
        'server.lifecycle' => ['Installation and lifecycle', self::SERVER, [
            'server:install.completed' => ['Installation completed', Severity::Success],
            'server:install.failed' => ['Installation failed', Severity::Danger],
            'server:reinstall' => ['Reinstall requested', Severity::Warning],
            'server:reinstall.completed' => ['Reinstall completed', Severity::Success],
            'server:reinstall.failed' => ['Reinstall failed', Severity::Danger],
            'server:suspended' => ['Server suspended', Severity::Warning],
            'server:unsuspended' => ['Server unsuspended', Severity::Success],
            'server:transfer.completed' => ['Transfer completed', Severity::Success],
            'server:transfer.failed' => ['Transfer failed', Severity::Danger],
        ]],
        'server.console' => ['Console', self::SERVER, [
            'server:console.command' => ['Console command sent', Severity::Info],
        ]],
        'server.backups' => ['Backups', self::SERVER, [
            'server:backup.start' => ['Backup started', Severity::Info],
            'server:backup.complete' => ['Backup completed', Severity::Success],
            'server:backup.fail' => ['Backup failed', Severity::Danger],
            'server:backup.restore' => ['Backup restore started', Severity::Warning],
            'server:backup.restore-complete' => ['Backup restored', Severity::Success],
            'server:backup.restore-failed' => ['Backup restore failed', Severity::Danger],
            'server:backup.delete' => ['Backup deleted', Severity::Warning],
            'server:backup.download' => ['Backup downloaded', Severity::Info],
            'server:backup.lock' => ['Backup locked', Severity::Info],
            'server:backup.unlock' => ['Backup unlocked', Severity::Info],
        ]],
        'server.databases' => ['Databases', self::SERVER, [
            'server:database.create' => ['Database created', Severity::Success],
            'server:database.rotate-password' => ['Database password rotated', Severity::Info],
            'server:database.delete' => ['Database deleted', Severity::Warning],
        ]],
        'server.files' => ['Files', self::SERVER, [
            'server:file.read' => ['File viewed', Severity::Info],
            'server:file.write' => ['File saved', Severity::Info],
            'server:file.uploaded' => ['File uploaded', Severity::Info],
            'server:file.create-directory' => ['Directory created', Severity::Info],
            'server:file.rename' => ['Files renamed or moved', Severity::Info],
            'server:file.copy' => ['File copied', Severity::Info],
            'server:file.delete' => ['Files deleted', Severity::Warning],
            'server:file.compress' => ['Files compressed', Severity::Info],
            'server:file.decompress' => ['Archive extracted', Severity::Info],
            'server:file.chmod' => ['Permissions changed', Severity::Info],
            'server:file.download' => ['File downloaded', Severity::Info],
            'server:file.pull' => ['Remote file pulled', Severity::Info],
        ]],
        'server.sftp' => ['SFTP', self::SERVER, [
            'server:sftp.denied' => ['SFTP access denied', Severity::Warning],
            'server:sftp.create' => ['Files created over SFTP', Severity::Info],
            'server:sftp.write' => ['Files modified over SFTP', Severity::Info],
            'server:sftp.delete' => ['Files deleted over SFTP', Severity::Warning],
            'server:sftp.create-directory' => ['Directories created over SFTP', Severity::Info],
            'server:sftp.rename' => ['Files renamed over SFTP', Severity::Info],
        ]],
        'server.network' => ['Network', self::SERVER, [
            'server:allocation.create' => ['Allocation added', Severity::Info],
            'server:allocation.notes' => ['Allocation notes changed', Severity::Info],
            'server:allocation.primary' => ['Primary allocation changed', Severity::Info],
            'server:allocation.delete' => ['Allocation removed', Severity::Warning],
        ]],
        'server.schedules' => ['Schedules', self::SERVER, [
            'server:schedule.create' => ['Schedule created', Severity::Info],
            'server:schedule.update' => ['Schedule updated', Severity::Info],
            'server:schedule.execute' => ['Schedule run manually', Severity::Info],
            'server:schedule.delete' => ['Schedule deleted', Severity::Warning],
            'server:task.create' => ['Task created', Severity::Info],
            'server:task.update' => ['Task updated', Severity::Info],
            'server:task.delete' => ['Task deleted', Severity::Warning],
        ]],
        'server.settings' => ['Settings and startup', self::SERVER, [
            'server:settings.rename' => ['Server renamed', Severity::Info],
            'server:settings.description' => ['Description changed', Severity::Info],
            'server:startup.edit' => ['Startup variable changed', Severity::Info],
            'server:startup.image' => ['Docker image changed', Severity::Warning],
        ]],
        'server.users' => ['Subusers', self::SERVER, [
            'server:subuser.create' => ['Subuser added', Severity::Info],
            'server:subuser.update' => ['Subuser permissions changed', Severity::Info],
            'server:subuser.delete' => ['Subuser removed', Severity::Warning],
        ]],
        'account.auth' => ['Sign-in', self::ACCOUNT, [
            'auth:success' => ['Signed in', Severity::Info],
            'auth:fail' => ['Failed sign-in', Severity::Danger],
            'auth:checkpoint' => ['Two-factor authentication requested', Severity::Info],
            'auth:token' => ['Two-factor challenge solved', Severity::Info],
            'auth:recovery-token' => ['Recovery code used', Severity::Warning],
            'auth:reset-password' => ['Password reset requested', Severity::Info],
            'auth:password-reset' => ['Password reset', Severity::Warning],
            'auth:ip-blocked' => ['Request from an unlisted IP blocked', Severity::Danger],
            'auth:sftp.fail' => ['Failed SFTP sign-in', Severity::Danger],
        ]],
        'account.security' => ['Account', self::ACCOUNT, [
            'user:user.create' => ['Account created', Severity::Success],
            'user:account.email-changed' => ['Email address changed', Severity::Warning],
            'user:account.password-changed' => ['Password changed', Severity::Warning],
            'user:two-factor.create' => ['Two-factor authentication enabled', Severity::Success],
            'user:two-factor.delete' => ['Two-factor authentication disabled', Severity::Warning],
            'user:api-key.create' => ['API key created', Severity::Info],
            'user:api-key.delete' => ['API key deleted', Severity::Warning],
            'user:ssh-key.create' => ['SSH key added', Severity::Info],
            'user:ssh-key.delete' => ['SSH key removed', Severity::Warning],
        ]],
        'admin.servers' => ['Servers', self::ADMIN, [
            'server:provisioned' => ['Server provisioned on Wings', Severity::Success],
            'server:deleted' => ['Server deleted', Severity::Warning],
            'admin:server.create' => ['Server created', Severity::Success],
            'admin:server.delete' => ['Server deleted by an admin', Severity::Warning],
            'admin:server.details' => ['Server details updated', Severity::Info],
            'admin:server.build' => ['Build configuration updated', Severity::Info],
            'admin:server.startup' => ['Startup configuration updated', Severity::Info],
            'admin:server.reinstall' => ['Server reinstalled by an admin', Severity::Warning],
            'admin:server.rebuild' => ['Server rebuild triggered', Severity::Info],
            'admin:server.suspend' => ['Server suspended by an admin', Severity::Warning],
            'admin:server.unsuspend' => ['Server unsuspended by an admin', Severity::Success],
            'admin:server.toggle-install' => ['Install status toggled', Severity::Info],
            'admin:server.transfer' => ['Server transfer started', Severity::Info],
            'admin:server.mount' => ['Mount added to a server', Severity::Info],
            'admin:server.unmount' => ['Mount removed from a server', Severity::Info],
            'admin:server-backup.toggle-lock' => ['Backup lock toggled', Severity::Info],
            'admin:server-database.create' => ['Server database created', Severity::Info],
            'admin:server-database.delete' => ['Server database deleted', Severity::Warning],
            'admin:server-database.rotate-password' => ['Server database password rotated', Severity::Info],
        ]],
        'admin.users' => ['Users', self::ADMIN, [
            'admin:user.create' => ['User created', Severity::Success],
            'admin:user.update' => ['User updated', Severity::Info],
            'admin:user.delete' => ['User deleted', Severity::Warning],
            'admin:user.disable-2fa' => ['Two-factor disabled by an admin', Severity::Warning],
        ]],
        'admin.nodes' => ['Nodes and allocations', self::ADMIN, [
            'node:unreachable' => ['Node unreachable', Severity::Danger],
            'node:reachable' => ['Node reachable again', Severity::Success],
            'admin:node.create' => ['Node created', Severity::Success],
            'admin:node.update' => ['Node updated', Severity::Info],
            'admin:node.delete' => ['Node deleted', Severity::Warning],
            'admin:node.deploy-token' => ['Node deployment token generated', Severity::Warning],
            'admin:node.tags' => ['Node egg tags updated', Severity::Info],
            'admin:node.deployment-tags' => ['Node deployment tags updated', Severity::Info],
            'admin:node-allocation.create' => ['Allocations added', Severity::Info],
            'admin:node-allocation.alias' => ['Allocation alias set', Severity::Info],
            'admin:node-allocation.delete' => ['Allocation deleted', Severity::Warning],
            'admin:node-allocation.delete-block' => ['Unassigned allocations deleted', Severity::Warning],
        ]],
        'admin.locations' => ['Locations', self::ADMIN, [
            'admin:location.create' => ['Location created', Severity::Info],
            'admin:location.update' => ['Location updated', Severity::Info],
            'admin:location.delete' => ['Location deleted', Severity::Warning],
        ]],
        'admin.eggs' => ['Eggs', self::ADMIN, [
            'admin:egg.create' => ['Egg created', Severity::Info],
            'admin:egg.update' => ['Egg updated', Severity::Info],
            'admin:egg.delete' => ['Egg deleted', Severity::Warning],
            'admin:egg.import' => ['Egg imported', Severity::Info],
            'admin:egg.update-import' => ['Egg updated from an import', Severity::Info],
            'admin:egg.scripts' => ['Egg install script updated', Severity::Info],
            'admin:egg.tags' => ['Egg tags updated', Severity::Info],
            'admin:egg-variable.create' => ['Egg variable created', Severity::Info],
            'admin:egg-variable.update' => ['Egg variable updated', Severity::Info],
            'admin:egg-variable.delete' => ['Egg variable deleted', Severity::Warning],
            'admin:egg-variable.reorder' => ['Egg variables reordered', Severity::Info],
        ]],
        'admin.mounts' => ['Mounts', self::ADMIN, [
            'admin:mount.create' => ['Mount created', Severity::Info],
            'admin:mount.update' => ['Mount updated', Severity::Info],
            'admin:mount.delete' => ['Mount deleted', Severity::Warning],
            'admin:mount.attach-egg' => ['Eggs attached to a mount', Severity::Info],
            'admin:mount.detach-egg' => ['Egg detached from a mount', Severity::Info],
            'admin:mount.attach-node' => ['Nodes attached to a mount', Severity::Info],
            'admin:mount.detach-node' => ['Node detached from a mount', Severity::Info],
        ]],
        'admin.database-hosts' => ['Database hosts', self::ADMIN, [
            'admin:database-host.create' => ['Database host created', Severity::Info],
            'admin:database-host.update' => ['Database host updated', Severity::Info],
            'admin:database-host.delete' => ['Database host deleted', Severity::Warning],
        ]],
        'admin.api' => ['Application API keys', self::ADMIN, [
            'admin:api-key.create' => ['Application API key created', Severity::Warning],
            'admin:api-key.update' => ['Application API key updated', Severity::Info],
            'admin:api-key.delete' => ['Application API key deleted', Severity::Info],
        ]],
        'admin.tags' => ['Tags', self::ADMIN, [
            'admin:tag.create' => ['Tag created', Severity::Info],
            'admin:tag.update' => ['Tag updated', Severity::Info],
            'admin:tag.delete' => ['Tag deleted', Severity::Info],
        ]],
        'admin.appearance' => ['Themes and extensions', self::ADMIN, [
            'admin:theme.activate' => ['Theme activated', Severity::Info],
            'admin:theme.reset' => ['Theme reset to classic', Severity::Info],
            'admin:theme.settings' => ['Theme settings updated', Severity::Info],
            'admin:theme.image' => ['Theme image uploaded', Severity::Info],
            'admin:theme.image-clear' => ['Theme image removed', Severity::Info],
            'extension:installed' => ['Extension installed', Severity::Info],
            'extension:enabled' => ['Extension enabled', Severity::Success],
            'extension:disabled' => ['Extension disabled', Severity::Warning],
            'extension:removed' => ['Extension removed', Severity::Warning],
            'extension:failed' => ['Extension failed to load', Severity::Danger],
        ]],
    ];

    /** @var array<string, EventDefinition>|null */
    private static ?array $definitions = null;

    /** @return array<string, EventDefinition> */
    public static function all(): array
    {
        if (self::$definitions !== null) {
            return self::$definitions;
        }

        $definitions = [];
        foreach (self::GROUPS as $group => [, $scopes, $events]) {
            foreach ($events as $key => [$label, $severity]) {
                $definitions[$key] = new EventDefinition($key, $group, $label, $severity, $scopes);
            }
        }

        return self::$definitions = $definitions;
    }

    /**
     * The definition of a key, or one made up for a key the catalogue does not list (another
     * extension's activity, for instance), scoped by its prefix.
     */
    public static function definition(string $key): EventDefinition
    {
        if ($key === self::TEST) {
            return new EventDefinition($key, 'test', 'Test delivery', Severity::Info, Scope::cases());
        }

        return self::all()[$key] ?? new EventDefinition($key, 'other', Str::headline(Str::after($key, ':')), Severity::Info, match (Str::before($key, ':')) {
            'server' => self::SERVER,
            'user', 'auth' => self::ACCOUNT,
            default => self::ADMIN,
        });
    }

    /** Whether the monitor has to poll Wings for an endpoint subscribed to this key. */
    public static function isMonitored(string $key): bool
    {
        return str_starts_with($key, 'server:state.') || str_starts_with($key, 'server:resources.');
    }

    /** @return list<string> */
    public static function monitoredKeys(): array
    {
        return array_values(array_filter(array_keys(self::all()), self::isMonitored(...)));
    }

    /**
     * The groups a scope can subscribe to, for the endpoint editor.
     *
     * @return list<array{id: string, label: string, events: list<array{key: string, label: string, severity: string}>}>
     */
    public static function groupsFor(Scope $scope): array
    {
        $groups = [];
        foreach (self::GROUPS as $id => [$label, $scopes, $events]) {
            if (! in_array($scope, $scopes, true)) {
                continue;
            }

            $groups[] = [
                'id' => $id,
                'label' => $label,
                'events' => array_map(
                    fn (string $key, array $event): array => ['key' => $key, 'label' => $event[0], 'severity' => $event[1]->value],
                    array_keys($events),
                    array_values($events),
                ),
            ];
        }

        return $groups;
    }

    /**
     * Whether a subscription pattern selects a key: an exact key, a `*` wildcard such as
     * `server:backup.*`, or `*` for everything.
     */
    public static function matches(string $pattern, string $key): bool
    {
        return $pattern === $key || ($pattern !== '' && str_contains($pattern, '*') && Str::is($pattern, $key));
    }

    /** @param list<string> $patterns */
    public static function selects(array $patterns, string $key): bool
    {
        foreach ($patterns as $pattern) {
            if (self::matches($pattern, $key)) {
                return true;
            }
        }

        return false;
    }
}
