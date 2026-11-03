<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Forges;

final readonly class Commit
{
    public function __construct(
        public string $sha,
        public string $message = '',
        public string $author = '',
        public ?string $date = null,
        public ?string $url = null,
    ) {}

    /** The commit's first line, which lists show. */
    public function title(): string
    {
        return mb_substr(trim(strtok($this->message, "\n") ?: ''), 0, 500);
    }

    /** @return array{sha: string, title: string, author: string, date: string|null, url: string|null} */
    public function toArray(): array
    {
        return ['sha' => $this->sha, 'title' => $this->title(), 'author' => $this->author, 'date' => $this->date, 'url' => $this->url];
    }
}
