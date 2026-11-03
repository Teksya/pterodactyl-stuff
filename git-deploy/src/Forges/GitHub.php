<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/** GitHub and GitHub Enterprise Server, with a personal access token (fine-grained: Contents read). */
final class GitHub extends ApiForge
{
    protected function client(): PendingRequest
    {
        $base = $this->url->host === 'github.com' ? 'https://api.github.com' : $this->url->webBase().'/api/v3';
        $client = Http::baseUrl($base)->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28']);

        return $this->token !== null ? $client->withToken($this->token) : $client;
    }

    private function repo(): string
    {
        return '/repos/'.$this->url->path;
    }

    public function head(string $branch): Commit
    {
        return self::commit($this->json($this->repo().'/commits/'.rawurlencode($branch)));
    }

    public function commits(string $branch, int $limit = 20): array
    {
        return array_map(self::commit(...), array_values(array_filter($this->json($this->repo().'/commits', ['sha' => $branch, 'per_page' => $limit]), is_array(...))));
    }

    protected function archivePath(string $sha): string
    {
        return $this->repo().'/zipball/'.rawurlencode($sha);
    }

    /** @param  array<mixed>  $data */
    private static function commit(array $data): Commit
    {
        $sha = $data['sha'] ?? null;
        if (! is_string($sha)) {
            throw new ForgeException('GitHub did not return a commit.');
        }

        return new Commit(
            $sha,
            (string) ($data['commit']['message'] ?? ''),
            (string) ($data['commit']['author']['name'] ?? $data['author']['login'] ?? ''),
            is_string($data['commit']['author']['date'] ?? null) ? $data['commit']['author']['date'] : null,
            is_string($data['html_url'] ?? null) ? $data['html_url'] : null,
        );
    }
}
