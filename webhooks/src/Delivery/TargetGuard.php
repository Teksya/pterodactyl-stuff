<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Delivery;

use Symfony\Component\HttpFoundation\IpUtils;

/**
 * Keeps server and account endpoints, which any user can create, from reaching the panel's own
 * network: the target must be http(s) and every address its host resolves to must be public,
 * unless the administrator allows private targets. The request is then pinned to the address
 * checked here, so a DNS answer that changes in between cannot point it elsewhere.
 */
final class TargetGuard
{
    /** Ranges filter_var's NO_PRIV_RANGE and NO_RES_RANGE flags let through. */
    private const array BLOCKED = [
        '0.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '192.0.0.0/24', '192.0.2.0/24',
        '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
        '::/128', '::1/128', '64:ff9b::/96', '100::/64', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'ff00::/8',
    ];

    /**
     * @return array{host: string, port: int, ip: string|null} `ip` is the address to pin to, null when the host is an IP itself
     *
     * @throws InvalidTarget
     */
    public function check(string $url, bool $allowPrivate): array
    {
        $parts = parse_url($url);
        $scheme = mb_strtolower((string) ($parts['scheme'] ?? ''));
        if ($parts === false || ! in_array($scheme, ['http', 'https'], true) || ($parts['host'] ?? '') === '') {
            throw new InvalidTarget('Only http:// and https:// URLs can be used.');
        }

        $host = mb_strtolower(trim((string) $parts['host'], '[]'));
        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
        $literal = filter_var($host, FILTER_VALIDATE_IP) !== false;

        $addresses = $literal ? [$host] : $this->resolve($host);
        if ($addresses === []) {
            throw new InvalidTarget(sprintf('%s does not resolve to an address.', $host));
        }

        if (! $allowPrivate) {
            foreach ($addresses as $address) {
                if (! $this->isPublic($address)) {
                    throw new InvalidTarget(sprintf('%s points to a private or reserved address (%s), which this panel does not allow.', $host, $address));
                }
            }
        }

        return ['host' => $host, 'port' => $port, 'ip' => $literal ? null : $addresses[0]];
    }

    public function isPublic(string $address): bool
    {
        if (str_starts_with(mb_strtolower($address), '::ffff:') && filter_var(substr($address, 7), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            return $this->isPublic(substr($address, 7));
        }

        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }

        return ! IpUtils::checkIp($address, self::BLOCKED);
    }

    /** @return list<string> */
    private function resolve(string $host): array
    {
        $addresses = gethostbynamel($host) ?: [];
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $record) {
            if (isset($record['ipv6']) && is_string($record['ipv6'])) {
                $addresses[] = $record['ipv6'];
            }
        }

        return array_values(array_unique($addresses));
    }
}
