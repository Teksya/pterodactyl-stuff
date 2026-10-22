<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\WebAuthn;

/** The unpadded base64url encoding WebAuthn uses for binary values in JSON. */
final class Base64Url
{
    public static function encode(string $binary): string
    {
        return rtrim(strtr(base64_encode($binary), '+/', '-_'), '=');
    }

    /** @throws InvalidCeremony */
    public static function decode(string $value): string
    {
        if (preg_match('/^[A-Za-z0-9_-]*$/', $value) !== 1) {
            throw new InvalidCeremony('The security key response is malformed.');
        }

        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) {
            throw new InvalidCeremony('The security key response is malformed.');
        }

        return $decoded;
    }
}
