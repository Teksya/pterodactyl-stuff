<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Events\Severity;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** A Microsoft Teams channel, through a Workflows "post to a channel when a webhook request is received" flow. */
final class Teams extends Provider
{
    public function id(): string
    {
        return 'teams';
    }

    public function label(): string
    {
        return 'Microsoft Teams';
    }

    public function description(): string
    {
        return 'Channel → Workflows → "Post to a channel when a webhook request is received", then copy the URL it gives.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Workflow URL', Field::URL, required: true, secret: true, placeholder: 'https://prod-00.westeurope.logic.azure.com/workflows/…'),
        ];
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $card = [
            '$schema' => 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type' => 'AdaptiveCard',
            'version' => '1.4',
            'msteams' => ['width' => 'Full'],
            'body' => [
                [
                    'type' => 'TextBlock',
                    'text' => Str::limit($message->title, 250),
                    'weight' => 'Bolder',
                    'size' => 'Medium',
                    'wrap' => true,
                    'color' => match ($message->severity) {
                        Severity::Danger => 'Attention',
                        Severity::Warning => 'Warning',
                        Severity::Success => 'Good',
                        Severity::Info => 'Accent',
                    },
                ],
                ['type' => 'TextBlock', 'text' => Str::limit($message->description, 3000), 'wrap' => true],
                [
                    'type' => 'FactSet',
                    'facts' => array_map(fn (array $field): array => ['title' => $field['name'], 'value' => Str::limit($field['value'], 500)], $message->fields),
                ],
            ],
        ];

        if ($message->url !== '') {
            $card['actions'] = [['type' => 'Action.OpenUrl', 'title' => 'Open in '.$message->footer, 'url' => $message->url]];
        }

        return OutgoingRequest::json((string) $config['url'], [
            'type' => 'message',
            'attachments' => [['contentType' => 'application/vnd.microsoft.card.adaptive', 'contentUrl' => null, 'content' => $card]],
        ]);
    }
}
