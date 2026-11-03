<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/** GitLab.com and self-managed GitLab, with a project, group or personal access token (read_repository, read_api). */
final class GitLab extends ApiForge
{
    protected function client(): PendingRequest
    {
        $client = Http::baseUrl($this->url->webBase().'/api/v4')->acceptJson();

        return $this->token !== null ? $client->withHeaders(['PRIVATE-TOKEN' => $this->token]) : $client;
    }

    private function project(): string
    {
        return '/projects/'.rawurlencode($this->url->path);
    }

    public function head(string $branch): Commit
    {
        return self::commit($this->json($this->project().'/repository/commits/'.rawurlencode($branch)));
    }

    public function commits(string $branch, int $limit = 20): array
    {
        return array_map(self::commit(...), array_values(array_filter($this->json($this->project().'/repository/commits', ['ref_name' => $branch, 'per_page' => $limit]), is_array(...))));
    }

    protected function archivePath(string $sha): string
    {
        return $this->project().'/repository/archive.zip?sha='.rawurlencode($sha);
    }

    /** @param  array<mixed>  $data */
    private static function commit(array $data): Commit
    {
        $sha = $data['id'] ?? null;
        if (! is_string($sha)) {
            throw new ForgeException('GitLab did not return a commit.');
        }

        return new Commit(
            $sha,
            (string) ($data['message'] ?? $data['title'] ?? ''),
            (string) ($data['author_name'] ?? ''),
            is_string($data['committed_date'] ?? null) ? $data['committed_date'] : null,
            is_string($data['web_url'] ?? null) ? $data['web_url'] : null,
        );
    }
}
