<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use OlivierDutoit\GitDeploy\Settings;
use ZipArchive;

/** A forge with an HTTP API: commits from its API, files from its zip archive of a commit. */
abstract class ApiForge implements Forge
{
    public function __construct(protected readonly RepoUrl $url, protected readonly ?string $token) {}

    abstract protected function client(): PendingRequest;

    /** The archive's URL, relative to the client's base URL. */
    abstract protected function archivePath(string $sha): string;

    public function fetch(string $sha, string $directory): string
    {
        $this->url->guard();
        $zip = $directory.'.zip';
        $max = Settings::int('max_archive_mb', 1, 2048) * 1024 * 1024;

        try {
            $response = $this->client()->timeout(300)->withOptions(['sink' => $zip])->get($this->archivePath($sha));
        } catch (ConnectionException) {
            throw new ForgeException("{$this->url->host} could not be reached.");
        }
        if (! $response->successful()) {
            @unlink($zip);
            throw new ForgeException($this->refusal($response, 'the archive'));
        }
        if (filesize($zip) > $max) {
            @unlink($zip);
            throw new ForgeException(sprintf('The archive is over %d MB, the most the administrator allows.', $max / 1024 / 1024));
        }

        try {
            return self::extract($zip, $directory);
        } finally {
            @unlink($zip);
        }
    }

    /** Extracts a zip into $directory and returns the folder holding the files: the archive's one top folder, if it has one. */
    public static function extract(string $zip, string $directory): string
    {
        $archive = new ZipArchive();
        if ($archive->open($zip) !== true) {
            throw new ForgeException('The forge sent an archive that cannot be opened.');
        }
        for ($index = 0; $index < $archive->numFiles; $index++) {
            $name = (string) $archive->getNameIndex($index);
            if (in_array('..', explode('/', str_replace(chr(92), '/', $name)), true) || str_starts_with($name, '/')) {
                $archive->close();
                throw new ForgeException('The archive holds a path outside its folder.');
            }
        }
        $archive->extractTo($directory);
        $archive->close();

        $entries = array_values(array_diff(scandir($directory) ?: [], ['.', '..']));

        return count($entries) === 1 && is_dir($directory.'/'.$entries[0]) ? $directory.'/'.$entries[0] : $directory;
    }

    /**
     * @return array<mixed>
     *
     * @throws ForgeException
     */
    protected function json(string $path, array $query = []): array
    {
        $this->url->guard();

        try {
            $response = $this->client()->timeout(20)->get($path, $query);
        } catch (ConnectionException) {
            throw new ForgeException("{$this->url->host} could not be reached.");
        }
        if (! $response->successful()) {
            throw new ForgeException($this->refusal($response, 'the repository'));
        }

        $json = $response->json();

        return is_array($json) ? $json : [];
    }

    protected function refusal(Response $response, string $what): string
    {
        return match ($response->status()) {
            401 => "{$this->url->host} refused the token: check it, and that it has not expired.",
            403 => "{$this->url->host} refused access to {$what}: the token needs read access to the repository's contents.",
            404 => "{$this->url->host} does not show {$what} to this token: check the address, the branch, and that the token can read the repository.",
            default => "{$this->url->host} answered HTTP {$response->status()} for {$what}.",
        };
    }
}
