<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\WebAuthn;

use Illuminate\Support\Facades\Session;
use lbuchs\WebAuthn\WebAuthn;
use lbuchs\WebAuthn\WebAuthnException;
use OlivierDutoit\SecurityKeys\Models\SecurityKey;
use Pterodactyl\Models\User;

/**
 * The two WebAuthn ceremonies, on top of lbuchs/webauthn: registering a key and checking an
 * assertion made with one. Each challenge lives in the session for one ceremony: it is taken
 * out by the first attempt to complete it, expires on its own, and is bound to its purpose and
 * to the account it was issued for.
 */
final class Ceremony
{
    public const string REGISTER = 'register';

    public const string CHECKPOINT = 'checkpoint';

    public const string LOGIN = 'login';

    /** How long the browser lets the user answer, in seconds. */
    private const int TIMEOUT = 120;

    /** A challenge outlives the browser's timeout by a little, for the round trip. */
    private const int CHALLENGE_LIFETIME = 150;

    private const string SESSION_PREFIX = 'security-keys.challenge.';

    /**
     * `navigator.credentials.create()` options for a new key of `$user`. Its existing keys are
     * excluded, so the browser refuses to register the same authenticator twice. A discoverable
     * key must store a passkey and verify the user: with only "preferred", browsers register a
     * security key without one, and the key then cannot sign in without a password.
     *
     * @param  iterable<SecurityKey>  $existing
     * @return array<string, mixed>
     *
     * @throws WebAuthnException
     */
    public function registrationOptions(User $user, string $userHandle, iterable $existing, bool $discoverable): array
    {
        $webauthn = $this->server();
        $exclude = [];
        foreach ($existing as $key) {
            $exclude[] = Base64Url::decode($key->credential_id);
        }

        $args = $webauthn->getCreateArgs(
            Base64Url::decode($userHandle),
            $user->email,
            $user->username,
            self::TIMEOUT,
            $discoverable ? 'required' : 'discouraged',
            $discoverable ? 'required' : 'discouraged',
            null,
            $exclude,
        );

        // No attestation: the panel does not restrict authenticator models, and asking for one
        // makes some browsers show a privacy prompt. The library's placeholder extension is
        // replaced by credProps, which reports whether the key stored a passkey.
        $args->publicKey->attestation = 'none';
        $args->publicKey->extensions = (object) ['credProps' => true];

        $this->remember(self::REGISTER, $webauthn->getChallenge()->getBinaryString(), $user->id);

        return $this->toArray($args)['publicKey'];
    }

    /**
     * Check a `navigator.credentials.create()` response against the registration challenge
     * issued to `$user`.
     *
     * @param  array<string, mixed>  $credential
     * @return array{credential_id: string, public_key: string, sign_count: int, aaguid: string|null}
     *
     * @throws InvalidCeremony
     */
    public function register(User $user, array $credential, bool $requireUserVerification): array
    {
        $challenge = $this->take(self::REGISTER, $user->id);
        $clientData = Base64Url::decode($this->field($credential, 'clientDataJSON'));
        $this->assertOrigin($clientData);

        try {
            $data = $this->server()->processCreate(
                $clientData,
                Base64Url::decode($this->field($credential, 'attestationObject')),
                $challenge,
                $requireUserVerification,
            );
        } catch (WebAuthnException $exception) {
            throw new InvalidCeremony('The security key could not be registered: '.$exception->getMessage(), previous: $exception);
        }

        $aaguid = is_string($data->AAGUID) && mb_strlen($data->AAGUID, '8bit') === 16 ? $this->formatUuid($data->AAGUID) : null;

        return [
            'credential_id' => Base64Url::encode($data->credentialId),
            'public_key' => $data->credentialPublicKey,
            'sign_count' => is_int($data->signatureCounter) ? $data->signatureCounter : 0,
            'aaguid' => $aaguid === '00000000-0000-0000-0000-000000000000' ? null : $aaguid,
        ];
    }

    /**
     * `navigator.credentials.get()` options. With keys, the browser only offers those; without,
     * it lets the user pick any passkey stored for the panel (a passwordless sign-in).
     *
     * @param  iterable<SecurityKey>  $keys
     * @return array<string, mixed>
     *
     * @throws WebAuthnException
     */
    public function assertionOptions(string $purpose, ?int $userId, iterable $keys, bool $requireUserVerification): array
    {
        $webauthn = $this->server();
        $ids = [];
        foreach ($keys as $key) {
            $ids[] = Base64Url::decode($key->credential_id);
        }

        $args = $webauthn->getGetArgs($ids, self::TIMEOUT, requireUserVerification: $requireUserVerification ? 'required' : 'discouraged');
        $this->remember($purpose, $webauthn->getChallenge()->getBinaryString(), $userId);

        return $this->toArray($args)['publicKey'];
    }

    /**
     * The raw credential id of a `navigator.credentials.get()` response, to look the key up by.
     *
     * @param  array<string, mixed>  $credential
     *
     * @throws InvalidCeremony
     */
    public function credentialId(array $credential): string
    {
        $id = $credential['rawId'] ?? $credential['id'] ?? null;
        if (! is_string($id) || $id === '') {
            throw new InvalidCeremony('The security key response has no credential id.');
        }

        return Base64Url::decode($id);
    }

    /**
     * Check an assertion made with `$key` against the challenge issued for `$purpose` (to
     * `$userId`, when it was issued to an account), and record the key's new signature
     * counter and use. A null key is a credential the lookup did not accept; the challenge
     * is used up all the same.
     *
     * @param  array<string, mixed>  $credential
     *
     * @throws InvalidCeremony
     */
    public function verify(string $purpose, ?int $userId, ?SecurityKey $key, array $credential, bool $requireUserVerification): void
    {
        $challenge = $this->take($purpose, $userId);
        if ($key === null) {
            throw new InvalidCeremony('This security key is not registered to your account.');
        }

        $clientData = Base64Url::decode($this->field($credential, 'clientDataJSON'));
        $this->assertOrigin($clientData);

        $webauthn = $this->server();

        try {
            $webauthn->processGet(
                $clientData,
                Base64Url::decode($this->field($credential, 'authenticatorData')),
                Base64Url::decode($this->field($credential, 'signature')),
                $key->public_key,
                $challenge,
                $key->sign_count,
                $requireUserVerification,
            );
        } catch (WebAuthnException $exception) {
            throw new InvalidCeremony('The security key response is not valid: '.$exception->getMessage(), previous: $exception);
        }

        $key->forceFill([
            'sign_count' => $webauthn->getSignatureCounter() ?? $key->sign_count,
            'last_used_at' => now(),
        ])->save();
    }

    /** Drop the challenge pending for `$purpose`, after a request that could not use it. */
    public function discard(string $purpose): void
    {
        Session::forget(self::SESSION_PREFIX.$purpose);
    }

    /** The relying party: the panel's host, from `app.url`, as passkeys are bound to it. */
    public function relyingPartyId(): string
    {
        $host = parse_url((string) config('app.url'), PHP_URL_HOST);

        return is_string($host) && $host !== '' ? mb_strtolower($host) : 'localhost';
    }

    /** The only origin assertions are accepted from: the scheme, host and port of `app.url`. */
    public function expectedOrigin(): string
    {
        $url = parse_url((string) config('app.url'));
        $scheme = mb_strtolower(is_array($url) && isset($url['scheme']) ? $url['scheme'] : 'https');
        $port = is_array($url) && isset($url['port']) ? (int) $url['port'] : null;
        $default = $scheme === 'https' ? 443 : 80;

        return $scheme.'://'.$this->relyingPartyId().($port !== null && $port !== $default ? ':'.$port : '');
    }

    private function server(): WebAuthn
    {
        // Base64url for every binary value of the options, as the browser script decodes them.
        return new WebAuthn((string) config('app.name', 'Pterodactyl'), $this->relyingPartyId(), null, true);
    }

    private function remember(string $purpose, string $challenge, ?int $userId): void
    {
        Session::put(self::SESSION_PREFIX.$purpose, [
            'challenge' => Base64Url::encode($challenge),
            'user_id' => $userId,
            'expires_at' => now()->addSeconds(self::CHALLENGE_LIFETIME)->getTimestamp(),
        ]);
    }

    /**
     * Take the pending challenge out of the session: whatever the outcome, an attempt uses it.
     *
     * @throws InvalidCeremony
     */
    private function take(string $purpose, ?int $userId): string
    {
        $pending = Session::pull(self::SESSION_PREFIX.$purpose);

        if (! is_array($pending) || ! is_string($pending['challenge'] ?? null) || ! is_int($pending['expires_at'] ?? null)) {
            throw new InvalidCeremony('No security key request is pending. Try again.');
        }

        if ($pending['expires_at'] < now()->getTimestamp()) {
            throw new InvalidCeremony('The security key request expired. Try again.');
        }

        if (($pending['user_id'] ?? null) !== $userId) {
            throw new InvalidCeremony('The security key request was made for another account.');
        }

        return Base64Url::decode($pending['challenge']);
    }

    /**
     * The library accepts any origin whose host ends with the relying party id; only the
     * panel's own origin is accepted here.
     *
     * @throws InvalidCeremony
     */
    private function assertOrigin(string $clientDataJson): void
    {
        $clientData = json_decode($clientDataJson, true);
        $origin = is_array($clientData) ? ($clientData['origin'] ?? null) : null;

        if (! is_string($origin) || ! hash_equals($this->expectedOrigin(), mb_strtolower(rtrim($origin, '/')))) {
            throw new InvalidCeremony('The security key was used on another site than this panel.');
        }
    }

    /**
     * A base64url field of the credential's `response`.
     *
     * @param  array<string, mixed>  $credential
     *
     * @throws InvalidCeremony
     */
    private function field(array $credential, string $name): string
    {
        $response = $credential['response'] ?? null;
        $value = is_array($response) ? ($response[$name] ?? null) : null;

        if (! is_string($value) || $value === '') {
            throw new InvalidCeremony(sprintf('The security key response has no %s.', $name));
        }

        return $value;
    }

    /** @return array<string, mixed> */
    private function toArray(object $args): array
    {
        $decoded = json_decode((string) json_encode($args, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);

        return is_array($decoded) ? $decoded : [];
    }

    private function formatUuid(string $binary): string
    {
        $hex = bin2hex($binary);

        return sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20, 12));
    }
}
