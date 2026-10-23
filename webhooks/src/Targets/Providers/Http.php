<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/**
 * Any HTTP endpoint: the whole payload as JSON, signed with HMAC-SHA256 when a secret is set.
 * The receiver checks `X-Webhook-Signature` against `sha256=` + HMAC(secret, timestamp + "." + body),
 * with the timestamp from `X-Webhook-Timestamp`, and rejects old timestamps to stop replays.
 */
final class Http extends Provider
{
    public function id(): string
    {
        return 'http';
    }

    public function label(): string
    {
        return 'HTTP (JSON)';
    }

    public function description(): string
    {
        return 'POSTs the full event as JSON. With a signing secret, X-Webhook-Signature is "sha256=" followed by the HMAC-SHA256 of "<X-Webhook-Timestamp>.<body>".';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'URL', Field::URL, required: true, placeholder: 'https://example.com/hooks/pterodactyl'),
            new Field('method', 'Method', Field::SELECT, required: true, options: [
                ['value' => 'POST', 'label' => 'POST'],
                ['value' => 'PUT', 'label' => 'PUT'],
                ['value' => 'PATCH', 'label' => 'PATCH'],
            ], default: 'POST'),
            new Field('secret', 'Signing secret', secret: true, help: 'Signs every request with HMAC-SHA256. At least 16 characters.', rules: ['min:16']),
            new Field('headers', 'Extra headers', Field::HEADERS, secret: true, help: 'One "Name: value" per line, such as an Authorization header.', placeholder: 'Authorization: Bearer …'),
        ];
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $body = OutgoingRequest::encode($payload);
        $timestamp = (string) time();

        $headers = [
            ...$this->headers($config),
            'Content-Type' => 'application/json',
            'X-Webhook-Event' => (string) ($payload['event'] ?? ''),
            'X-Webhook-Delivery' => (string) ($payload['id'] ?? ''),
            'X-Webhook-Timestamp' => $timestamp,
        ];

        if (($config['secret'] ?? '') !== '') {
            $headers['X-Webhook-Signature'] = 'sha256='.hash_hmac('sha256', $timestamp.'.'.$body, (string) $config['secret']);
        }

        return new OutgoingRequest((string) ($config['method'] ?? 'POST'), (string) $config['url'], $headers, $body);
    }
}
