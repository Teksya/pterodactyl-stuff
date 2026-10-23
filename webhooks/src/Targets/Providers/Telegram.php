<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets\Providers;

use OlivierDutoit\Webhooks\Targets\Field;
use OlivierDutoit\Webhooks\Targets\Message;
use OlivierDutoit\Webhooks\Targets\OutgoingRequest;
use OlivierDutoit\Webhooks\Targets\Provider;

/** A Telegram chat, group or channel, through a bot made with @BotFather. */
final class Telegram extends Provider
{
    public function id(): string
    {
        return 'telegram';
    }

    public function label(): string
    {
        return 'Telegram';
    }

    public function description(): string
    {
        return 'Create a bot with @BotFather, add it to the chat, and give its token and the chat id (a channel can also be @name).';
    }

    public function fields(): array
    {
        return [
            new Field('bot_token', 'Bot token', required: true, secret: true, placeholder: '123456789:AA…', rules: ['regex:/^\d{5,}:[\w-]{30,}$/']),
            new Field('chat_id', 'Chat id', required: true, placeholder: '-1001234567890 or @channel', rules: ['regex:/^(-?\d{1,20}|@\w{5,64})$/']),
            new Field('thread_id', 'Topic id', help: 'For a forum group: the topic to post in.', rules: ['regex:/^\d{1,20}$/']),
            new Field('silent', 'Send silently', Field::TOGGLE, help: 'Deliver without a notification sound.', default: false),
        ];
    }

    public function targetLabel(array $config): string
    {
        return 'Telegram chat '.($config['chat_id'] ?? '');
    }

    public function request(array $config, array $payload, Message $message): OutgoingRequest
    {
        $data = [
            'chat_id' => (string) $config['chat_id'],
            'text' => $message->html(break: "\n", limit: 3500),
            'parse_mode' => 'HTML',
            'link_preview_options' => ['is_disabled' => true],
            'disable_notification' => (bool) ($config['silent'] ?? false),
        ];
        if (($config['thread_id'] ?? '') !== '') {
            $data['message_thread_id'] = (int) $config['thread_id'];
        }

        return OutgoingRequest::json('https://api.telegram.org/bot'.$config['bot_token'].'/sendMessage', $data);
    }
}
