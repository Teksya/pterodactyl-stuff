<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\Http\Controllers;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use OlivierDutoit\SecurityKeys\Models\SecurityKey;
use OlivierDutoit\SecurityKeys\SecurityKeysProvider;
use OlivierDutoit\SecurityKeys\WebAuthn\Base64Url;
use OlivierDutoit\SecurityKeys\WebAuthn\Ceremony;
use OlivierDutoit\SecurityKeys\WebAuthn\InvalidCeremony;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Base\InvalidPasswordProvidedException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Extensions;
use Pterodactyl\Models\User;

/**
 * The signed-in user's own keys. The routes only accept a panel session, never an API key, and
 * adding or removing a key asks for the account password, as turning two-factor on or off does.
 */
final class AccountKeysController
{
    public function __construct(private readonly Ceremony $ceremony) {}

    public function index(Request $request): JsonResponse
    {
        $keys = SecurityKey::query()->where('user_id', $this->user($request)->id)->oldest()->get();

        return new JsonResponse(['data' => $keys->map(fn (SecurityKey $key): array => $key->toPanelArray())->all()]);
    }

    /** Check the password, then hand out the options for `navigator.credentials.create()`. */
    public function options(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string'], 'passwordless' => ['sometimes', 'boolean']]);
        $user = $this->user($request);
        $this->checkPassword($user, $request);

        $keys = SecurityKey::query()->where('user_id', $user->id)->get();
        $passkey = $this->passwordless() && $request->boolean('passwordless');

        return new JsonResponse(['data' => [
            'public_key' => $this->ceremony->registrationOptions($user, $this->userHandle($user), $keys, $passkey),
        ]]);
    }

    /** Register the key the browser created with the options from options(). */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:64'],
            'credential' => ['required', 'array'],
            'credential.response' => ['required', 'array'],
            'credential.response.clientDataJSON' => ['required', 'string', 'max:8192'],
            'credential.response.attestationObject' => ['required', 'string', 'max:65535'],
            'credential.response.transports' => ['nullable', 'array', 'max:8'],
            'credential.response.transports.*' => ['string', 'max:32'],
        ]);

        $user = $this->user($request);
        $credential = $request->input('credential');

        try {
            $registered = $this->ceremony->register($user, is_array($credential) ? $credential : [], false);
        } catch (InvalidCeremony $exception) {
            throw new DisplayException($exception->getMessage(), $exception);
        }

        $transports = $request->input('credential.response.transports');

        try {
            $key = SecurityKey::query()->create([
                'user_id' => $user->id,
                'name' => $request->string('name')->trim()->toString(),
                'credential_hash' => SecurityKey::hashOf(Base64Url::decode($registered['credential_id'])),
                'credential_id' => $registered['credential_id'],
                'public_key' => $registered['public_key'],
                'sign_count' => $registered['sign_count'],
                'user_handle' => $this->userHandle($user),
                'aaguid' => $registered['aaguid'],
                'transports' => is_array($transports) ? array_values(array_filter($transports, is_string(...))) : null,
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            throw new DisplayException('This security key is already registered.', $exception);
        }

        Activity::event('user:security-key.create')->subject($user)->property('name', $key->name)->log();

        return new JsonResponse(['data' => $key->toPanelArray()], Response::HTTP_CREATED);
    }

    public function update(Request $request, int $key): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:64']]);
        $model = $this->find($request, $key);
        $model->update(['name' => $request->string('name')->trim()->toString()]);

        return new JsonResponse(['data' => $model->toPanelArray()]);
    }

    public function destroy(Request $request, int $key): Response
    {
        $request->validate(['password' => ['required', 'string']]);
        $user = $this->user($request);
        $this->checkPassword($user, $request);

        $model = $this->find($request, $key);
        $model->delete();

        Activity::event('user:security-key.delete')->subject($user)->property('name', $model->name)->log();

        return new Response('', Response::HTTP_NO_CONTENT);
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return $user;
    }

    private function find(Request $request, int $id): SecurityKey
    {
        return SecurityKey::query()->where('user_id', $this->user($request)->id)->findOrFail($id);
    }

    private function checkPassword(User $user, Request $request): void
    {
        throw_unless(
            Hash::check($request->string('password')->toString(), $user->password),
            InvalidPasswordProvidedException::class,
            trans('validation.internal.invalid_password'),
        );
    }

    /**
     * The WebAuthn user handle of the account: random, so it reveals nothing about the account,
     * and shared by all its keys, so passkeys on one authenticator replace each other.
     */
    private function userHandle(User $user): string
    {
        $existing = SecurityKey::query()->where('user_id', $user->id)->value('user_handle');

        return is_string($existing) && $existing !== '' ? $existing : $this->newHandle($user);
    }

    /** One handle per account for the length of a registration, until its first key is saved. */
    private function newHandle(User $user): string
    {
        $session = 'security-keys.user-handle.'.$user->id;
        $handle = session($session);
        if (! is_string($handle)) {
            $handle = Base64Url::encode(random_bytes(32));
            session([$session => $handle]);
        }

        return $handle;
    }

    private function passwordless(): bool
    {
        return Extensions::settings(SecurityKeysProvider::ID)->get('passwordless', false) === true;
    }
}
