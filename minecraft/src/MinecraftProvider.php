<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft;

use Illuminate\Console\Scheduling\Schedule;
use OlivierDutoit\Minecraft\Console\SnapshotsCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class MinecraftProvider extends ExtensionProvider
{
    public const string ID = 'minecraft';

    public function boot(): void
    {
        // routes/server.php: the players, their files and the lists, the worlds and their snapshots,
        // and the server icon.
        $this->registerApiRoutes();

        $this->registerPermissions('Minecraft players and worlds.', [
            'read' => 'See the players, online and saved: health, position, inventory, ender chest, effects and statistics, and the worlds.',
            'manage' => 'Act on players (kick, ban, teleport, heal, give and move items, game modes…), the whitelist and operators, and the world\'s weather, time and rules.',
            'worlds' => 'Take, restore and delete world snapshots, and switch, create and delete worlds.',
        ]);

        $this->registerCommands([SnapshotsCommand::class]);
        $this->registerSchedule(function (Schedule $schedule): void {
            $schedule->command('minecraft:snapshots')->everyFifteenMinutes()->withoutOverlapping(30);
        });

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('textures', 'textures', true, ['boolean'])
                ->label('Skins and item pictures')
                ->help('Show players\' skins and items\' pictures, which the browser loads from mc-heads.net, mc.nerothe.com and mcasset.cloud. Off: generated avatars and item names, with no outside request.')
                ->field('toggle')
                ->frontend(),
            ExtensionSettingDefinition::make('status_host', 'status_host', '', ['nullable', 'string', 'max:255'])
                ->label('Server address for the status ping')
                ->help('Where the panel asks the game who is online, for servers whose allocation listens on every address (0.0.0.0). Empty: the node\'s FQDN. Servers on a specific address are always asked there.')
                ->field('text'),
            ExtensionSettingDefinition::make('max_snapshots', 'max_snapshots', 10, ['integer', 'min:1', 'max:100'])
                ->label('Snapshots per server')
                ->help('How many snapshots users take by hand on one server. They are kept in the server\'s .snapshots folder and count towards its disk space.')
                ->field('number')
                ->tab('Snapshots'),
            ExtensionSettingDefinition::make('automatic_keep', 'automatic_keep', 5, ['integer', 'min:1', 'max:100'])
                ->label('Automatic snapshots kept')
                ->help('How many snapshots taken before a restore are kept per server, and the default number a schedule keeps of its own. The oldest are deleted.')
                ->field('number')
                ->tab('Snapshots'),
        ]));
    }
}
