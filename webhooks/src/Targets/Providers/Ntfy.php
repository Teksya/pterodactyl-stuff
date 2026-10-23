<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use OlivierDutoit\Webhooks\Events\Severity;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** An ntfy topic, on ntfy.sh or a self-hosted server, published as JSON. */
final class Ntfy extends Provider
{
    public function id(): string
    {
        return 'ntfy';
    }

    public function label(): string
    {
        return 'ntfy';
    }

    public function description(): string
    {
        return 'The topic URL, such as https://ntfy.sh/my-panel-alerts. Anyone who knows a public topic can read it: pick a long, random name or use an access token.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Topic URL', Field::URL, required: true, secret: true, placeholder: 'https://ntfy.sh/my-topic', rules: ['regex:#^https?://[^/]+(/.*)?/[\w-]{1,64}/?$#']),
            new Field('token', 'Access token', secret: true, help: 'For a protected topic: a tk_… token, sent as a Bearer token.'),
        ];
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $url = rtrim((string) $config['url'], '/');
        $position = (int) strrpos($url, '/');

        $headers = [];
        if (($config['token'] ?? '') !== '') {
            $headers['Authorization'] = 'Bearer '.$config['token'];
        }

        // JSON goes to the server's root, with the topic in the body.
        return OutgoingRequest::json(substr($url, 0, $position) ?: $url, array_filter([
            'topic' => substr($url, $position + 1),
            'title' => $message->title,
            'message' => $message->markdown(),
            'markdown' => true,
            'priority' => $message->severity->priority(),
            'tags' => [match ($message->severity) {
                Severity::Danger => 'rotating_light',
                Severity::Warning => 'warning',
                Severity::Success => 'white_check_mark',
                Severity::Info => 'information_source',
            }],
            'click' => $message->url !== '' ? $message->url : null,
        ], fn ($value): bool => $value !== null), $headers);
    }
}
