<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

use InvalidArgumentException;

/**
 * A kind of target: how its settings look, and how a payload becomes the request it expects.
 */
abstract class Provider
{
    public const string MASK = '********';

    abstract public function id(): string;

    abstract public function label(): string;

    /** @return list<Field> */
    abstract public function fields(): array;

    /**
     * @param  array<string, mixed>  $config  the stored settings, secrets decrypted
     * @param  array<string, mixed>  $payload  the event as WebhookEvent::payload() built it
     */
    abstract public function request(array $config, array $payload, Message $message): OutgoingRequest;

    public function description(): string
    {
        return '';
    }

    /** @return list<string> the fields that decide where requests go */
    public function targetKeys(): array
    {
        return ['url'];
    }

    /** What lists show of the target, never a secret. */
    public function targetLabel(array $config): string
    {
        $host = parse_url((string) ($config['url'] ?? ''), PHP_URL_HOST);

        return is_string($host) ? $host : '';
    }

    /** @return array<string, list<mixed>> Laravel rules, keyed `config.<field>` */
    public function rules(): array
    {
        $rules = [];
        foreach ($this->fields() as $field) {
            $rules['config.'.$field->key] = $field->validationRules();
        }

        return $rules;
    }

    /**
     * The submitted settings, reduced to the provider's fields, with secrets sent back masked
     * (or left out) keeping their stored value.
     *
     * @param  array<string, mixed>  $submitted
     * @param  array<string, mixed>  $stored
     * @return array<string, mixed>
     *
     * @throws InvalidArgumentException when a value is not usable, with a message for the user
     */
    public function normalize(array $submitted, array $stored = []): array
    {
        // A saved secret only goes where it went before: with a new address it has to be typed again,
        // or whoever may edit the webhook could send the owner's token to a host of their own.
        $moved = false;
        foreach ($this->targetKeys() as $key) {
            if ($stored !== [] && array_key_exists($key, $submitted) && $submitted[$key] !== self::MASK && trim((string) $submitted[$key]) !== (string) ($stored[$key] ?? '')) {
                $moved = true;
            }
        }

        $config = [];
        foreach ($this->fields() as $field) {
            $value = $submitted[$field->key] ?? null;
            if ($field->secret && ($value === self::MASK || ! array_key_exists($field->key, $submitted))) {
                $value = $stored[$field->key] ?? null;
                if ($moved && $value !== null && $value !== '' && ! in_array($field->key, $this->targetKeys(), true)) {
                    throw new InvalidArgumentException(sprintf('The address changed: type the %s again.', mb_strtolower($field->label)));
                }
            }

            $value = match ($field->type) {
                Field::TOGGLE => (bool) ($value ?? $field->default ?? false),
                default => is_string($value) ? trim($value) : ($value === null ? $field->default : (string) $value),
            };

            if ($field->required && ($value === null || $value === '')) {
                throw new InvalidArgumentException(sprintf('%s is required.', $field->label));
            }

            if ($field->type === Field::HEADERS) {
                Headers::parse(is_string($value) ? $value : null);
            }

            $config[$field->key] = $value;
        }

        return $config;
    }

    /**
     * The settings as the screens show them, secrets masked.
     *
     * @param  array<string, mixed>  $config
     * @return array<string, mixed>
     */
    public function mask(array $config): array
    {
        $masked = [];
        foreach ($this->fields() as $field) {
            $value = $config[$field->key] ?? null;
            $masked[$field->key] = $field->secret && $value !== null && $value !== '' ? self::MASK : $value;
        }

        return $masked;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id(),
            'label' => $this->label(),
            'description' => $this->description(),
            'fields' => array_map(fn (Field $field): array => $field->toArray(), $this->fields()),
        ];
    }

    /** The extra headers a HEADERS field holds. */
    protected function headers(array $config, string $key = 'headers'): array
    {
        return Headers::parse(is_string($config[$key] ?? null) ? $config[$key] : null);
    }
}
