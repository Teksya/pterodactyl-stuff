<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Symfony\Component\Process\Process;
use Throwable;

/**
 * Any Git server, through the git command on the panel's host: over SSH with the deploy key the
 * panel made, or over HTTPS with a token. Lists no commits: Git alone cannot without a clone.
 */
final class GenericGit implements Forge
{
    public function __construct(
        private readonly RepoUrl $url,
        private readonly ?string $token,
        private readonly ?string $privateKey,
        private readonly string $branch,
    ) {}

    public static function available(): bool
    {
        try {
            return (new Process(['git', '--version']))->setTimeout(10)->run() === 0;
        } catch (Throwable) {
            return false;
        }
    }

    public function head(string $branch): Commit
    {
        $output = $this->git(['ls-remote', $this->remote(), 'refs/heads/'.$branch], null, 60);
        $sha = strtok(trim($output), "\t");
        if (! is_string($sha) || ! preg_match('/^[0-9a-f]{40,64}$/', $sha)) {
            throw new ForgeException("The branch {$branch} does not exist in the repository.");
        }

        return new Commit($sha);
    }

    public function commits(string $branch, int $limit = 20): array
    {
        return [];
    }

    public function fetch(string $sha, string $directory): string
    {
        if (! is_dir($directory) && ! mkdir($directory, 0700, true)) {
            throw new ForgeException('The panel cannot write its temporary folder.');
        }

        $this->git(['init', '-q'], $directory);
        try {
            $this->git(['fetch', '-q', '--depth', '1', $this->remote(), $sha], $directory, 300);
        } catch (ForgeException) {
            // Servers that refuse fetching a commit by its id: the branch, deep enough to hold it.
            $this->git(['fetch', '-q', '--depth', '50', $this->remote(), 'refs/heads/'.$this->branch], $directory, 300);
        }
        $this->git(['-c', 'advice.detachedHead=false', 'checkout', '-q', $sha], $directory);

        return $directory;
    }

    /** The address git uses: the SSH one as given, an HTTPS one with the token as its password. */
    private function remote(): string
    {
        if ($this->url->ssh || $this->token === null) {
            return $this->url->original;
        }

        return preg_replace('#^(https?://)#', '$1oauth2:'.rawurlencode($this->token).'@', $this->url->original) ?? $this->url->original;
    }

    /** @param  list<string>  $arguments */
    private function git(array $arguments, ?string $directory, int $timeout = 30): string
    {
        $this->url->guard();
        $key = null;
        $knownHosts = null;
        $environment = ['GIT_TERMINAL_PROMPT' => '0', 'GIT_ASKPASS' => 'echo'];

        try {
            if ($this->url->ssh) {
                if ($this->privateKey === null) {
                    throw new ForgeException('Generate a deploy key and add it to the repository first.');
                }
                $key = tempnam(sys_get_temp_dir(), 'gd-key-') ?: null;
                $knownHosts = tempnam(sys_get_temp_dir(), 'gd-hosts-') ?: null;
                if ($key === null || $knownHosts === null) {
                    throw new ForgeException('The panel cannot write its temporary folder.');
                }
                file_put_contents($key, rtrim($this->privateKey)."\n");
                chmod($key, 0600);
                $environment['GIT_SSH_COMMAND'] = sprintf(
                    'ssh -i %s -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=%s -o BatchMode=yes',
                    escapeshellarg($key),
                    escapeshellarg($knownHosts),
                );
            }

            $process = new Process(['git', ...$arguments], $directory, $environment, null, $timeout);
            $process->run();
            if (! $process->isSuccessful()) {
                throw new ForgeException('git: '.$this->hide(trim($process->getErrorOutput() ?: $process->getOutput()) ?: 'failed'));
            }

            return $process->getOutput();
        } catch (ForgeException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            throw new ForgeException('git could not run on the panel\'s host: '.$this->hide($exception->getMessage()));
        } finally {
            foreach ([$key, $knownHosts] as $file) {
                if (is_string($file)) {
                    @unlink($file);
                }
            }
        }
    }

    /** A message without the token, whatever git printed. */
    private function hide(string $message): string
    {
        $message = mb_substr($message, 0, 500);

        return $this->token !== null ? str_replace([$this->token, rawurlencode($this->token)], '***', $message) : $message;
    }
}
