<?php

declare(strict_types=1);

namespace OlivierDutoit\Turnstile;

use Illuminate\Validation\ValidationException;
use OlivierDutoit\Turnstile\Http\Middleware\VerifyTurnstile;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Http\Middleware\VerifyReCaptcha;
use Pterodactyl\Http\Requests\Api\Admin\Settings\UpdateAdvancedSettingsRequest;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class TurnstileProvider extends ExtensionProvider
{
    public function register(): void
    {
        // The panel's `recaptcha` route middleware (login, forgot password, password reset)
        // resolves VerifyReCaptcha from the container, so Turnstile checks those routes instead.
        $this->app->bind(VerifyReCaptcha::class, VerifyTurnstile::class);
    }

    public function boot(): void
    {
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('site_key', 'site_key', '', ['nullable', 'string', 'max:255'])
                ->label('Site key')
                ->help('The Turnstile widget\'s site key, from Cloudflare dashboard → Turnstile.')
                ->frontend()
                ->public(),
            ExtensionSettingDefinition::make('secret_key', 'secret_key', '', ['nullable', 'string', 'max:255'])
                ->label('Secret key')
                ->help('The widget\'s secret key. Until both keys are set, the panel keeps its own reCAPTCHA check.')
                ->secret(),
            ExtensionSettingDefinition::make('theme', 'theme', 'auto', ['required', 'in:auto,light,dark'])
                ->label('Widget theme')
                ->field('select', [
                    ['value' => 'auto', 'label' => 'Follow the browser'],
                    ['value' => 'light', 'label' => 'Light'],
                    ['value' => 'dark', 'label' => 'Dark'],
                ])
                ->frontend()
                ->public(),
            ExtensionSettingDefinition::make('verify_hostname', 'verify_hostname', true, ['boolean'])
                ->label('Verify hostname')
                ->help('Reject tokens solved on another hostname than the one the panel is served from.')
                ->field('toggle'),
        ]));

        $this->disableReCaptcha();
    }

    /**
     * Once Turnstile has both keys, reCAPTCHA is off for good: the panel boots its stored
     * settings into `recaptcha.enabled` before extensions, so turning it off here keeps
     * Google's script and badge off the auth pages and shows it disabled in Admin → Settings
     * → Advanced, where turning it back on is refused.
     */
    private function disableReCaptcha(): void
    {
        if ($this->configured()) {
            config(['recaptcha.enabled' => false]);
        }

        $this->app->resolving(UpdateAdvancedSettingsRequest::class, function (UpdateAdvancedSettingsRequest $request): void {
            if ($request->boolean('recaptcha:enabled') &&$this->configured()) {
                throw ValidationException::withMessages([
                    'recaptcha:enabled' => 'reCAPTCHA is replaced by Cloudflare Turnstile. Disable the Turnstile extension, or clear its keys, to turn it back on.',
                ]);
            }
        });
    }

    /** Whether both keys are set, the same test VerifyTurnstile makes before taking over. */
    private function configured(): bool
    {
        $siteKey = $this->settings()->get('site_key');
        $secret = $this->settings()->get('secret_key');

        return is_string($siteKey) && $siteKey !== '' && is_string($secret) && $secret !== '';
    }
}
