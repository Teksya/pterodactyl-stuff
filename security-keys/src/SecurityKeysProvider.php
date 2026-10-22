<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys;

use OlivierDutoit\SecurityKeys\Actions\RequireSecurityKeyCheckpoint;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class SecurityKeysProvider extends ExtensionProvider
{
    public const string ID = 'security-keys';

    public function boot(): void
    {
        // routes/client.php (the account's keys) and routes/admin.php (a user's keys).
        $this->registerApiRoutes();
        // The sign-in endpoints, for visitors: they need the session of the login page.
        $this->registerWebRoutes($this->extensionPath('routes', 'web.php'));

        // An account with a key and no authenticator app is still asked for a second factor.
        $this->wrapAction(CompletesLogins::class, fn (CompletesLogins $inner): CompletesLogins => new RequireSecurityKeyCheckpoint($inner));

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('passwordless', 'passwordless', false, ['boolean'])
                ->label('Passwordless sign-in')
                ->help('Show "Sign in with a security key" on the login page. Only passkeys (keys registered while this is on, that verify the user with a PIN or biometrics) can sign in this way, and they stand for both the password and the second factor.')
                ->field('toggle')
                ->frontend()
                ->public(),
        ]));
    }
}
