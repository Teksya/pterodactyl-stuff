<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use OlivierDutoit\Webhooks\Events\Severity;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** A Gotify server, with an application token. */
final class Gotify extends Provider
{
    public function id(): string
    {
        return 'gotify';
    }

    public function label(): string
    {
        return 'Gotify';
    }

    public function description(): string
    {
        return 'The server address and the token of an application created in Gotify → Apps.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Server URL', Field::URL, required: true, placeholder: 'https://gotify.example.com'),
            new Field('token', 'Application token', required: true, secret: true),
        ];
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $extras = ['client::display' => ['contentType' => 'text/markdown']];
        if ($message->url !== '') {
            $extras['client::notification'] = ['click' => ['url' => $message->url]];
        }

        return OutgoingRequest::json(rtrim((string) $config['url'], '/').'/message', [
            'title' => $message->title,
            'message' => $message->markdown(),
            'priority' => match ($message->severity) {
                Severity::Danger => 8,
                Severity::Warning => 5,
                Severity::Info, Severity::Success => 2,
            },
            'extras' => $extras,
        ], ['X-Gotify-Key' => (string) $config['token']]);
    }
}
