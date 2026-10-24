<?php

declare(strict_types=1);

namespace OlivierDutoit\AdminSidebar;

use Pterodactyl\Extensions\ExtensionProvider;

class AdminSidebarProvider extends ExtensionProvider
{
    public const string ID = 'admin-sidebar';

    public function boot(): void
    {
        // routes/admin.php: the arrangement of the admin navigation.
        $this->registerApiRoutes();
    }
}
