<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Events\Severity;

/**
 * The human-readable form of a payload that chat and push providers send: a title, the
 * activity sentence, a few facts and a link.
 */
final readonly class Message
{
    /** @param list<array{name: string, value: string}> $fields */
    public function __construct(
        public string $title,
        public string $description,
        public Severity $severity,
        public array $fields,
        public string $url,
        public string $footer,
        public string $timestamp,
    ) {}

    /** @param array<string, mixed> $payload */
    public static function fromPayload(array $payload): self
    {
        $fields = [];
        $server = is_array($payload['server'] ?? null) ? $payload['server'] : null;
        if ($server !== null) {
            $fields[] = ['name' => 'Server', 'value' => (string) ($server['name'] ?? $server['uuid'] ?? '')];
            if (($server['node']['name'] ?? '') !== '') {
                $fields[] = ['name' => 'Node', 'value' => (string) $server['node']['name']];
            }
        }

        $actor = is_array($payload['actor'] ?? null) ? $payload['actor'] : [];
        $fields[] = ['name' => 'By', 'value' => match ($actor['type'] ?? 'system') {
            'user' => (string) ($actor['username'] ?? 'A user'),
            'api_key' => 'An API key',
            default => 'System',
        }];

        if (is_string($payload['ip'] ?? null) && $payload['ip'] !== '') {
            $fields[] = ['name' => 'IP address', 'value' => $payload['ip']];
        }

        $fields[] = ['name' => 'Event', 'value' => (string) ($payload['event'] ?? '')];

        $panel = is_array($payload['panel'] ?? null) ? $payload['panel'] : [];
        $title = (string) ($payload['label'] ?? $payload['event'] ?? 'Event');

        return new self(
            title: ($payload['test'] ?? false) === true ? $title.' 🧪' : $title,
            description: (string) ($payload['description'] ?? ''),
            severity: Severity::tryFrom((string) ($payload['severity'] ?? '')) ?? Severity::Info,
            fields: $fields,
            url: (string) ($server['url'] ?? $panel['url'] ?? ''),
            footer: (string) ($panel['name'] ?? 'Pterodactyl'),
            timestamp: (string) ($payload['occurred_at'] ?? now()->toIso8601String()),
        );
    }

    /** One line per fact, for providers without fields. */
    public function plain(int $limit = 4000): string
    {
        $lines = [$this->description, ''];
        foreach ($this->fields as $field) {
            $lines[] = $field['name'].': '.$field['value'];
        }

        return Str::limit(trim(implode("\n", $lines)), $limit);
    }

    /** Markdown with the facts in bold, for ntfy, Gotify and Slack-like text. */
    public function markdown(int $limit = 4000): string
    {
        $lines = [$this->description, ''];
        foreach ($this->fields as $field) {
            $lines[] = '**'.$field['name'].':** '.$field['value'];
        }

        return Str::limit(trim(implode("\n", $lines)), $limit);
    }

    /** Escaped HTML with the title in bold, for Telegram, Matrix and Pushover. */
    public function html(bool $withTitle = true, string $break = '<br>', int $limit = 4000): string
    {
        $parts = [];
        if ($withTitle) {
            $parts[] = '<b>'.e($this->title).'</b>';
        }

        $parts[] = e(Str::limit($this->description, $limit));
        foreach ($this->fields as $field) {
            $parts[] = '<b>'.e($field['name']).':</b> '.e(Str::limit($field['value'], 500));
        }

        if ($this->url !== '') {
            $parts[] = '<a href="'.e($this->url).'">'.e($this->url).'</a>';
        }

        return implode($break, $parts);
    }
}
