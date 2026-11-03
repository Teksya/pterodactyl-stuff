<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use OlivierDutoit\GitDeploy\Settings;

/**
 * A repository's address, as people paste it: https://host/group/repo(.git),
 * git@host:group/repo.git or ssh://git@host:2222/group/repo.git.
 */
final readonly class RepoUrl
{
    private function __construct(
        public string $original,
        public bool $ssh,
        public string $scheme,
        public string $host,
        public ?int $port,
        /** group/sub/repo, without .git. */
        public string $path,
    ) {}

    /** @throws ForgeException */
    public static function parse(string $url): self
    {
        $url = trim($url);
        if (preg_match('#^([\w.-]+)@([\w.-]+):(?!\d+/)(/?[\w./-]+?)(?:\.git)?/?$#', $url, $match)) {
            return new self($url, true, 'ssh', strtolower($match[2]), null, trim($match[3], '/'));
        }

        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = preg_replace('#\.git/?$#', '', trim((string) ($parts['path'] ?? ''), '/')) ?? '';
        if (! in_array($scheme, ['https', 'http', 'ssh'], true) || $host === '' || ! str_contains($path, '/') || ! preg_match('#^[\w./-]+$#', $path)) {
            throw new ForgeException('Enter the repository\'s address, such as https://github.com/owner/repo or git@host:owner/repo.git.');
        }
        if (isset($parts['user']) && $scheme !== 'ssh') {
            throw new ForgeException('Put the token in its own field, not in the address.');
        }

        return new self($url, $scheme === 'ssh', $scheme, $host, isset($parts['port']) ? (int) $parts['port'] : null, $path);
    }

    /** The web address of the forge, which its API hangs off: https://host, or http://host for a plain HTTP address. */
    public function webBase(): string
    {
        $scheme = $this->scheme === 'http' ? 'http' : 'https';
        $port = $this->port !== null && ! $this->ssh ? ':'.$this->port : '';

        return "{$scheme}://{$this->host}{$port}";
    }

    public function webUrl(): string
    {
        return $this->webBase().'/'.$this->path;
    }

    /** owner and repo, for forges whose API takes them apart. */
    public function owner(): string
    {
        return substr($this->path, 0, (int) strrpos($this->path, '/'));
    }

    public function name(): string
    {
        return substr($this->path, (int) strrpos($this->path, '/') + 1);
    }

    /**
     * Refuses forges on private, loopback and link-local addresses unless the administrator allows
     * them: otherwise any user could make the panel send requests to its own network.
     *
     * @throws ForgeException
     */
    public function guard(): void
    {
        if (Settings::bool('private_hosts')) {
            return;
        }

        $addresses = filter_var($this->host, FILTER_VALIDATE_IP) !== false ? [$this->host] : (gethostbynamel($this->host) ?: []);
        if ($addresses === []) {
            throw new ForgeException("{$this->host} does not resolve.");
        }
        foreach ($addresses as $address) {
            if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                throw new ForgeException("{$this->host} is on a private network, which the administrator has not allowed (Admin → Extensions → Git Deploy).");
            }
        }
    }
}
