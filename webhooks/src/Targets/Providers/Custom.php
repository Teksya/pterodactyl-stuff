<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use InvalidArgumentException;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/**
 * Anything else: a request written as a template. `{{event}}`, `{{description}}`,
 * `{{server.name}}`... read the payload by path, `{{message}}` is the readable text and
 * `{{payload}}` the whole payload as JSON. Values are escaped for where they land: URL-encoded
 * in the URL and in form bodies, JSON-escaped in JSON bodies.
 */
final class Custom extends Provider
{
    public function id(): string
    {
        return 'custom';
    }

    public function label(): string
    {
        return 'Custom request';
    }

    public function description(): string
    {
        return 'Write the request yourself. Placeholders: {{event}}, {{label}}, {{severity}}, {{description}}, {{occurred_at}}, {{server.name}}, {{server.uuid}}, {{server.url}}, {{server.node.name}}, {{actor.username}}, {{panel.name}}, {{message}} and {{payload}} (the whole event as JSON).';
    }

    public function fields(): array
    {
        return [
            new Field('url', 'URL', Field::URL, required: true, help: 'Placeholders are URL-encoded here.', placeholder: 'https://api.example.com/notify?text={{message}}', rules: []),
            new Field('method', 'Method', Field::SELECT, required: true, options: [
                ['value' => 'POST', 'label' => 'POST'],
                ['value' => 'GET', 'label' => 'GET'],
                ['value' => 'PUT', 'label' => 'PUT'],
                ['value' => 'PATCH', 'label' => 'PATCH'],
                ['value' => 'DELETE', 'label' => 'DELETE'],
            ], default: 'POST'),
            new Field('content_type', 'Body type', Field::SELECT, required: true, options: [
                ['value' => 'application/json', 'label' => 'JSON'],
                ['value' => 'application/x-www-form-urlencoded', 'label' => 'Form'],
                ['value' => 'text/plain', 'label' => 'Plain text'],
            ], default: 'application/json'),
            new Field('body', 'Body template', Field::TEXTAREA, placeholder: '{"text": "{{label}}: {{description}}"}'),
            new Field('headers', 'Extra headers', Field::HEADERS, secret: true, help: 'One "Name: value" per line. Placeholders work here too.'),
        ];
    }

    public function normalize(array $submitted, array $stored = []): array
    {
        $config = parent::normalize($submitted, $stored);
        // The URL has placeholders in it, so it is checked once they are filled with a sample.
        if (filter_var($this->render((string) $config['url'], $this->sample(), 'url'), FILTER_VALIDATE_URL) === false) {
            throw new InvalidArgumentException('The URL is not valid once its placeholders are filled.');
        }

        return $config;
    }

    public function rules(): array
    {
        $rules = parent::rules();
        // Placeholders are not valid URL characters, see normalize().
        $rules['config.url'] = ['required', 'string', 'max:2048', 'regex:#^https?://#i'];

        return $rules;
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $payload['message'] = $message->title."\n".$message->plain();
        $type = (string) ($config['content_type'] ?? 'application/json');
        $context = match ($type) {
            'application/json' => 'json',
            'application/x-www-form-urlencoded' => 'form',
            default => 'text',
        };

        $headers = [];
        foreach ($this->headers($config) as $name => $value) {
            $headers[$name] = str_replace(["\r", "\n"], ' ', $this->render($value, $payload, 'text'));
        }

        $method = (string) ($config['method'] ?? 'POST');
        $template = (string) ($config['body'] ?? '');
        $body = $method === 'GET' || $template === '' ? null : $this->render($template, $payload, $context);
        if ($body !== null && $context === 'json') {
            json_decode($body);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new InvalidArgumentException('The body template does not give valid JSON: '.json_last_error_msg().'.');
            }
        }

        // A Content-Type among the extra headers, whatever its case, wins over the body type's.
        $named = array_filter(array_keys($headers), fn (string $name): bool => mb_strtolower($name) === 'content-type') !== [];
        if ($body !== null && ! $named) {
            $headers['Content-Type'] = $type.($context === 'text' ? '; charset=utf-8' : '');
        }

        return new OutgoingRequest($method, $this->render((string) $config['url'], $payload, 'url'), $headers, $body);
    }

    /** @param array<string, mixed> $payload */
    private function render(string $template, array $payload, string $context): string
    {
        return (string) preg_replace_callback('/\{\{\s*([\w.]+)\s*}}/', function (array $match) use ($payload, $context): string {
            $value = $match[1] === 'payload' ? $payload : data_get($payload, $match[1]);
            if (is_array($value)) {
                $value = OutgoingRequest::encode($value);
            } elseif (is_bool($value)) {
                $value = $value ? 'true' : 'false';
            }

            $value = (string) ($value ?? '');

            return match ($context) {
                'url', 'form' => rawurlencode($value),
                'json' => $match[1] === 'payload' ? $value : substr(json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '""', 1, -1),
                default => $value,
            };
        }, $template);
    }

    /** @return array<string, mixed> */
    private function sample(): array
    {
        return ['event' => 'server:power.start', 'label' => 'Server started', 'message' => 'Server started', 'server' => ['name' => 'Survival', 'uuid' => '00000000-0000-0000-0000-000000000000']];
    }
}
