<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\Http\Controllers;

use Illuminate\Auth\Events\Failed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use OlivierDutoit\SecurityKeys\Models\SecurityKey;
use OlivierDutoit\SecurityKeys\SecurityKeysProvider;
use OlivierDutoit\SecurityKeys\WebAuthn\Ceremony;
use OlivierDutoit\SecurityKeys\WebAuthn\InvalidCeremony;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Events\Auth\ProvidedAuthenticationToken;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\User;
use Pterodactyl\Traits\Helpers\ThrottlesLogins;

/**
 * Sign-ins with a security key, for visitors who are not signed in: as the second factor of
 * the panel's login checkpoint, and (when an administrator allows it) without a password.
 * Both finish through the panel's CompletesLogins::establish(), as its own checkpoint does,
 * and count failures against the same lockout as the panel's login and checkpoint.
 */
final class SignInController
{
    use ThrottlesLogins;

    private const string CHECKPOINT_EXPIRED = 'The authentication token provided has expired, please refresh the page and try again.';

    public function __construct(private readonly Ceremony $ceremony) {}

    /**
     * Options for answering the pending checkpoint with a key. `data` is null when the
     * account has none, and `only_method` tells the page the key is the account's only
     * second factor.
     */
    public function checkpointOptions(Request $request, CompletesLogins $logins): JsonResponse
    {
        $request->validate(['confirmation_token' => ['required', 'string', 'max:255']]);
        $this->guardLockout($request);

        $user = $this->checkpointUser($request, $logins);
        $keys = SecurityKey::query()->where('user_id', $user->id)->get();
        if ($keys->isEmpty()) {
            return new JsonResponse(['data' => null]);
        }

        return new JsonResponse(['data' => [
            'public_key' => $this->ceremony->assertionOptions(Ceremony::CHECKPOINT, $user->id, $keys, false),
            'only_method' => ! $user->use_totp,
        ]]);
    }

    /** Answer the pending checkpoint with an assertion from one of the account's keys. */
    public function checkpoint(Request $request, CompletesLogins $logins): JsonResponse
    {
        $request->validate(['confirmation_token' => ['required', 'string', 'max:255'], ...$this->credentialRules()]);
        $this->guardLockout($request);

        $user = $this->checkpointUser($request, $logins);
        $credential = $this->credential($request);

        try {
            $key = SecurityKey::query()
                ->where('user_id', $user->id)
                ->where('credential_hash', SecurityKey::hashOf($this->ceremony->credentialId($credential)))
                ->first();

            $this->ceremony->verify(Ceremony::CHECKPOINT, $user->id, $key, $credential, false);
        } catch (InvalidCeremony $exception) {
            $this->ceremony->discard(Ceremony::CHECKPOINT);
            $this->fail($request, $user, $exception->getMessage());
        }

        Event::dispatch(new ProvidedAuthenticationToken($user));

        return $this->loginResponse($logins->establish($user), $request);
    }

    /** Options for a passwordless sign-in: any passkey the browser holds for the panel. */
    public function loginOptions(Request $request): JsonResponse
    {
        abort_unless($this->passwordlessEnabled(), 404);
        $this->guardLockout($request);

        return new JsonResponse(['data' => [
            'public_key' => $this->ceremony->assertionOptions(Ceremony::LOGIN, null, [], true),
        ]]);
    }

    /**
     * A passwordless sign-in. The key must be a passkey (it returns the account's user handle)
     * and must have verified the user with a PIN or biometrics, so it stands for both factors.
     */
    public function login(Request $request, CompletesLogins $logins): JsonResponse
    {
        abort_unless($this->passwordlessEnabled(), 404);
        $request->validate([...$this->credentialRules(), 'credential.response.userHandle' => ['required', 'string', 'max:128']]);
        $this->guardLockout($request);

        $credential = $this->credential($request);
        $key = null;

        try {
            $key = SecurityKey::query()->where('credential_hash', SecurityKey::hashOf($this->ceremony->credentialId($credential)))->first();
            $handle = $request->string('credential.response.userHandle')->toString();

            $this->ceremony->verify(Ceremony::LOGIN, null, $key !== null && hash_equals($key->user_handle, $handle) ? $key : null, $credential, true);
        } catch (InvalidCeremony $exception) {
            $this->ceremony->discard(Ceremony::LOGIN);
            $this->fail($request, $key?->user, $exception->getMessage());
        }

        $user = $key?->user;
        if (! $user instanceof User) {
            $this->fail($request, null, 'This security key is not registered to an account.');
        }

        return $this->loginResponse($logins->establish($user), $request);
    }

    private function passwordlessEnabled(): bool
    {
        return Extensions::isAvailable(SecurityKeysProvider::ID)
            && Extensions::settings(SecurityKeysProvider::ID)->get('passwordless', false) === true;
    }

    /** The account of the checkpoint pending in this session, once its confirmation token matches. */
    private function checkpointUser(Request $request, CompletesLogins $logins): User
    {
        $checkpoint = $logins->pendingCheckpoint();
        if ($checkpoint === null) {
            $this->fail($request, null, self::CHECKPOINT_EXPIRED);
        }

        if (! $checkpoint->matches($request->string('confirmation_token')->toString())) {
            $this->fail($request, null, 'The security key could not be checked. Return to the login page and sign in again.');
        }

        $user = User::query()->find($checkpoint->userId);
        if (! $user instanceof User) {
            $this->fail($request, null, self::CHECKPOINT_EXPIRED);
        }

        return $user;
    }

    /** @return array<string, list<string>> */
    private function credentialRules(): array
    {
        return [
            'credential' => ['required', 'array'],
            'credential.id' => ['required', 'string', 'max:2048'],
            'credential.rawId' => ['nullable', 'string', 'max:2048'],
            'credential.response' => ['required', 'array'],
            'credential.response.clientDataJSON' => ['required', 'string', 'max:8192'],
            'credential.response.authenticatorData' => ['required', 'string', 'max:8192'],
            'credential.response.signature' => ['required', 'string', 'max:2048'],
        ];
    }

    /** @return array<string, mixed> */
    private function credential(Request $request): array
    {
        $credential = $request->input('credential');

        return is_array($credential) ? $credential : [];
    }

    private function guardLockout(Request $request): void
    {
        if ($this->hasTooManyLoginAttempts($request)) {
            $this->fireLockoutEvent($request);
            $this->sendLockoutResponse($request);
        }
    }

    /** Count the failure towards the lockout, as the panel's login endpoints do, and answer 400. */
    private function fail(Request $request, ?User $user, string $message): never
    {
        $this->incrementLoginAttempts($request);
        Event::dispatch(new Failed('auth', $user, []));

        throw new DisplayException($message);
    }

    private function loginResponse(LoginResult $result, Request $request): JsonResponse
    {
        if ($result->complete) {
            $this->clearLoginAttempts($request);
        }

        return new JsonResponse(['data' => $result->toResponseData()]);
    }
}
