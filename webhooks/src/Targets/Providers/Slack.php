<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/**
 * A Slack incoming webhook, as a coloured attachment. Mattermost and Rocket.Chat incoming
 * webhooks take the same payload.
 */
final class Slack extends Provider
{
    public function id(): string
    {
        return 'slack';
    }

    public function label(): string
    {
        return 'Slack, Mattermost, Rocket.Chat';
    }

    public function description(): string
    {
        return 'An incoming webhook URL. Mattermost and Rocket.Chat incoming webhooks accept the same messages.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Webhook URL', Field::URL, required: true, secret: true, placeholder: 'https://hooks.slack.com/services/…'),
            new Field('username', 'Bot name', help: 'Where the service allows overriding it.', rules: ['max:80']),
            new Field('icon_emoji', 'Icon emoji', placeholder: ':rocket:', rules: ['max:64']),
            new Field('channel', 'Channel', help: 'Where the service allows overriding it.', placeholder: '#alerts', rules: ['max:80']),
        ];
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $data = [
            'text' => Str::limit($message->title.': '.$message->description, 3000),
            'attachments' => [[
                'fallback' => Str::limit($message->title.': '.$message->description, 3000),
                'color' => $message->severity->hex(),
                'title' => Str::limit($message->title, 250),
                'title_link' => $message->url !== '' ? $message->url : null,
                'text' => Str::limit($message->description, 3000),
                'fields' => array_map(fn (array $field): array => [
                    'title' => $field['name'],
                    'value' => Str::limit($field['value'], 1000),
                    'short' => $field['name'] !== 'Event',
                ], $message->fields),
                'footer' => $message->footer,
                'ts' => strtotime($message->timestamp) ?: time(),
            ]],
        ];

        foreach (['username', 'icon_emoji', 'channel'] as $key) {
            if (($config[$key] ?? '') !== '') {
                $data[$key] = (string) $config[$key];
            }
        }

        return OutgoingRequest::json((string) $config['url'], $data);
    }
}
