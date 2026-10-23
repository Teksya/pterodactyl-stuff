<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** A Matrix room, posted to by a bot account's access token. */
final class Matrix extends Provider
{
    public function id(): string
    {
        return 'matrix';
    }

    public function label(): string
    {
        return 'Matrix';
    }

    public function description(): string
    {
        return 'The homeserver, the room id (Room settings → Advanced, such as !abc:matrix.org) and the access token of an account in that room.';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'Homeserver URL', Field::URL, required: true, placeholder: 'https://matrix.org'),
            new Field('room_id', 'Room id', required: true, placeholder: '!abcdef:matrix.org', rules: ['regex:/^![^:\s]+:\S+$/']),
            new Field('token', 'Access token', required: true, secret: true),
        ];
    }

    public function targetLabel(array $config): string
    {
        return 'Matrix room '.($config['room_id'] ?? '');
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        // The delivery id is the transaction id, so a retried request is not posted twice.
        $url = sprintf(
            '%s/_matrix/client/v3/rooms/%s/send/m.room.message/%s',
            rtrim((string) $config['url'], '/'),
            rawurlencode((string) $config['room_id']),
            rawurlencode((string) ($payload['id'] ?? uniqid('wh', true))),
        );

        return OutgoingRequest::json($url, [
            'msgtype' => 'm.text',
            'body' => $message->title."\n".$message->plain(),
            'format' => 'org.matrix.custom.html',
            'formatted_body' => $message->html(),
        ], ['Authorization' => 'Bearer '.$config['token']], 'PUT');
    }
}
