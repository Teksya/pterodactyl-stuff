<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Events\Severity;
use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** Pushover notifications to a user or group key. */
final class Pushover extends Provider
{
    public function id(): string
    {
        return 'pushover';
    }

    public function label(): string
    {
        return 'Pushover';
    }

    public function description(): string
    {
        return 'Your user (or group) key, and the API token of an application registered at pushover.net/apps.';
    }

    public function fields(): array
    {
        return [
            new Field('user_key', 'User or group key', required: true, secret: true, rules: ['regex:/^\w{30}$/']),
            new Field('app_token', 'Application API token', required: true, secret: true, rules: ['regex:/^\w{30}$/']),
            new Field('device', 'Device', help: 'Only this device; every device when empty.', rules: ['max:25']),
            new Field('sound', 'Sound', placeholder: 'pushover', rules: ['max:32']),
        ];
    }

    public function targetLabel(array $config): string
    {
        return 'Pushover'.(($config['device'] ?? '') !== '' ? ' → '.$config['device'] : '');
    }

    /** Pushover refuses messages over 1024 characters. */
    private const int LIMIT = 1024;

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        // HTML cannot be cut without breaking a tag: when it does not fit, plain text is sent cut.
        $text = $message->html(withTitle: false, break: "\n", limit: 500);
        $html = mb_strlen($text) <= self::LIMIT;
        if (! $html) {
            $text = Str::limit($message->plain(), self::LIMIT - 3);
        }

        return OutgoingRequest::json('https://api.pushover.net/1/messages.json', array_filter([
            'token' => (string) $config['app_token'],
            'user' => (string) $config['user_key'],
            'title' => Str::limit($message->title, 250, ''),
            'message' => $text,
            'html' => $html ? 1 : 0,
            'priority' => match ($message->severity) {
                Severity::Danger => 1,
                Severity::Warning, Severity::Success => 0,
                Severity::Info => -1,
            },
            'url' => $message->url !== '' ? $message->url : null,
            'url_title' => $message->url !== '' ? 'Open in '.$message->footer : null,
            'timestamp' => strtotime($message->timestamp) ?: time(),
            'device' => ($config['device'] ?? '') !== '' ? (string) $config['device'] : null,
            'sound' => ($config['sound'] ?? '') !== '' ? (string) $config['sound'] : null,
        ], fn ($value): bool => $value !== null));
    }
}
