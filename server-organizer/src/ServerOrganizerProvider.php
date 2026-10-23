<?php

declare(strict_types=1);

namespace OlivierDutoit\ServerOrganizer;

use Pterodactyl\Extensions\ExtensionProvider;

class ServerOrganizerProvider extends ExtensionProvider
{
    public const string ID = 'server-organizer';

    public function boot(): void
    {
        // routes/client.php: the signed-in user's layout, and what their servers' cards do not say.
        $this->registerApiRoutes();
    }
}
