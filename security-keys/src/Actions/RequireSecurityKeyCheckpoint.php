<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\Actions;

use Illuminate\Support\Facades\Session;
use OlivierDutoit\SecurityKeys\Models\SecurityKey;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Data\LoginCheckpoint;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;

/**
 * Wraps the panel's CompleteLogin so an account with a security key and no authenticator app
 * still gets a two-factor checkpoint after its password, answered with the key. Accounts that
 * use an authenticator app keep the panel's own checkpoint, where the key is one more way
 * through, and every other account signs in as before.
 *
 * The checkpoint is the panel's LoginCheckpoint, kept under a session key of the extension's
 * own, so pendingCheckpoint() hands it to the panel's checkpoint endpoint and to the
 * extension's alike.
 */
final readonly class RequireSecurityKeyCheckpoint implements CompletesLogins
{
    private const string SESSION_KEY = 'security-keys.checkpoint';

    /** Where the panel sends a completed login, as the core action does. */
    private const string INTENDED = '/';

    public function __construct(private CompletesLogins $inner) {}

    public function complete(User $user): LoginResult
    {
        Session::remove(self::SESSION_KEY);

        if ($user->use_totp || ! SecurityKey::query()->where('user_id', $user->id)->exists()) {
            return $this->inner->complete($user);
        }

        Activity::event('auth:checkpoint')->withRequestMetadata()->subject($user)->log();

        $checkpoint = LoginCheckpoint::issue($user->id);
        Session::put(self::SESSION_KEY, $checkpoint);

        return LoginResult::checkpoint($user, $checkpoint, self::INTENDED);
    }

    public function establish(User $user): LoginResult
    {
        Session::remove(self::SESSION_KEY);

        return $this->inner->establish($user);
    }

    /**
     * The newest pending checkpoint, the panel's or the extension's: one session may have
     * started a login with an authenticator app and then another without.
     */
    public function pendingCheckpoint(): ?LoginCheckpoint
    {
        $core = $this->inner->pendingCheckpoint();
        $own = Session::get(self::SESSION_KEY);
        $own = LoginCheckpoint::isPending($own) ? $own : null;

        if ($core === null || $own === null) {
            return $core ?? $own;
        }

        return $own->expiresAt->isAfter($core->expiresAt) ? $own : $core;
    }
}
