<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus;

use Pterodactyl\Extensions\ExtensionProvider;

class ConsolePlusProvider extends ExtensionProvider
{
    public const string ID = 'console-plus';

    public function boot(): void
    {
        // routes/server.php: the signed-in user's console preferences for a server, and its game.
        $this->registerApiRoutes();
    }
}
