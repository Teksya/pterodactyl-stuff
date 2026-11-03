<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/** Gitea, Forgejo and Codeberg, with an access token (repository: read). */
final class Gitea extends ApiForge
{
    protected function client(): PendingRequest
    {
        $client = Http::baseUrl($this->url->webBase().'/api/v1')->acceptJson();

        return $this->token !== null ? $client->withHeaders(['Authorization' => 'token '.$this->token]) : $client;
    }

    private function repo(): string
    {
        return '/repos/'.$this->url->path;
    }

    public function head(string $branch): Commit
    {
        $commits = $this->commits($branch, 1);
        if ($commits === []) {
            throw new ForgeException("The branch {$branch} has no commit.");
        }

        return $commits[0];
    }

    public function commits(string $branch, int $limit = 20): array
    {
        $data = $this->json($this->repo().'/commits', ['sha' => $branch, 'limit' => $limit, 'stat' => 'false', 'files' => 'false', 'verification' => 'false']);

        return array_map(self::commit(...), array_values(array_filter($data, is_array(...))));
    }

    protected function archivePath(string $sha): string
    {
        return $this->repo().'/archive/'.rawurlencode($sha).'.zip';
    }

    /** @param  array<mixed>  $data */
    private static function commit(array $data): Commit
    {
        $sha = $data['sha'] ?? null;
        if (! is_string($sha)) {
            throw new ForgeException('The forge did not return a commit.');
        }

        return new Commit(
            $sha,
            (string) ($data['commit']['message'] ?? ''),
            (string) ($data['commit']['author']['name'] ?? ''),
            is_string($data['commit']['author']['date'] ?? null) ? $data['commit']['author']['date'] : null,
            is_string($data['html_url'] ?? null) ? $data['html_url'] : null,
        );
    }
}
