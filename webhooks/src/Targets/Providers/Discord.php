<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** A Discord channel webhook, as an embed coloured by severity. */
final class Discord extends Provider
{
    public function id(): string
    {
        return 'discord';
    }

    public function label(): string
    {
        return 'Discord';
    }

    public function description(): string
    {
        return 'Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Webhook URL', Field::URL, required: true, secret: true, placeholder: 'https://discord.com/api/webhooks/…', rules: [
                'regex:#^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api(?:/v\d+)?/webhooks/\d+/[\w-]+/?(?:\?.*)?$#',
            ]),
            new Field('username', 'Bot name', help: 'Replaces the name set on the webhook.', placeholder: 'Pterodactyl', rules: ['max:80']),
            new Field('avatar_url', 'Avatar URL', Field::URL, help: 'Replaces the avatar set on the webhook.'),
            new Field('mention', 'Mention', help: 'Pinged with every message: <@&role id>, <@user id>, @here or @everyone.', placeholder: '<@&123456789012345678>', rules: ['max:200']),
        ];
    }

    public function targetLabel(array $config): string
    {
        return 'Discord webhook '.Str::of((string) ($config['url'] ?? ''))->after('/webhooks/')->before('/')->limit(24, '');
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $mention = trim((string) ($config['mention'] ?? ''));
        // Only the mention setting pings anyone: an event's text (a console command, a file
        // name) may contain @everyone too.
        preg_match_all('/<@&(\d+)>/', $mention, $roles);
        preg_match_all('/<@!?(\d+)>/', $mention, $users);

        $data = [
            'content' => $mention !== '' ? Str::limit($mention, 2000, '') : null,
            'allowed_mentions' => [
                'parse' => preg_match('/@(everyone|here)/', $mention) === 1 ? ['everyone'] : [],
                'roles' => array_values(array_unique($roles[1])),
                'users' => array_values(array_unique($users[1])),
            ],
            'embeds' => [array_filter([
                'title' => Str::limit($message->title, 250),
                'description' => Str::limit($message->description, 4000),
                'url' => $message->url !== '' ? $message->url : null,
                'color' => $message->severity->color(),
                'fields' => array_map(fn (array $field): array => [
                    'name' => Str::limit($field['name'], 250),
                    'value' => Str::limit($field['value'] !== '' ? $field['value'] : '—', 1000),
                    'inline' => $field['name'] !== 'Event',
                ], array_slice($message->fields, 0, 25)),
                'footer' => ['text' => Str::limit($message->footer, 2000)],
                'timestamp' => $message->timestamp,
            ], fn ($value): bool => $value !== null)],
        ];

        if (($config['username'] ?? '') !== '') {
            $data['username'] = Str::limit((string) $config['username'], 80, '');
        }
        if (($config['avatar_url'] ?? '') !== '') {
            $data['avatar_url'] = (string) $config['avatar_url'];
        }

        return OutgoingRequest::json((string) $config['url'], array_filter($data, fn ($value): bool => $value !== null));
    }
}
