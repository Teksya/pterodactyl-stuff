<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Deploy;

use OlivierDutoit\GitDeploy\Forges\ForgeException;

/** A deploy key: an RSA key pair, the private half for git, the public half in OpenSSH form to add to the repository. */
final class SshKey
{
    /** @return array{private: string, public: string} */
    public static function generate(string $comment): array
    {
        $key = openssl_pkey_new(['private_key_bits' => 4096, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        if ($key === false || ! openssl_pkey_export($key, $private)) {
            throw new ForgeException('The panel cannot generate a key: PHP\'s OpenSSL extension is missing or misconfigured.');
        }
        $details = openssl_pkey_get_details($key);
        if (! is_array($details) || ! isset($details['rsa']['n'], $details['rsa']['e'])) {
            throw new ForgeException('The panel cannot read the key it generated.');
        }

        $blob = self::string('ssh-rsa').self::mpint($details['rsa']['e']).self::mpint($details['rsa']['n']);

        return ['private' => (string) $private, 'public' => 'ssh-rsa '.base64_encode($blob).' '.preg_replace('/\s+/', '-', $comment)];
    }

    private static function string(string $value): string
    {
        return pack('N', strlen($value)).$value;
    }

    /** An SSH multiple-precision integer: big-endian, with a zero byte when the top bit is set. */
    private static function mpint(string $bytes): string
    {
        $bytes = ltrim($bytes, "\0");
        if ($bytes !== '' && (ord($bytes[0]) & 0x80) !== 0) {
            $bytes = "\0".$bytes;
        }

        return self::string($bytes);
    }
}
