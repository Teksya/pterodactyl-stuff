<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

/**
 * One setting of a provider, such as Discord's webhook URL or Telegram's chat id. The editor
 * draws it from toArray(); secret fields come back masked and keep their stored value when the
 * mask is sent back.
 */
final readonly class Field
{
    public const string URL = 'url';

    public const string TEXT = 'text';

    public const string TEXTAREA = 'textarea';

    public const string SELECT = 'select';

    public const string TOGGLE = 'toggle';

    /** "Name: value" lines, see Headers. */
    public const string HEADERS = 'headers';

    /**
     * @param  list<array{value: string, label: string}>  $options
     * @param  list<string>  $rules  extra Laravel rules for the value
     */
    public function __construct(
        public string $key,
        public string $label,
        public string $type = self::TEXT,
        public bool $required = false,
        public bool $secret = false,
        public string $help = '',
        public string $placeholder = '',
        public array $options = [],
        public mixed $default = null,
        public array $rules = [],
    ) {}

    /** @return list<mixed> */
    public function validationRules(): array
    {
        $rules = [$this->required ? 'required' : 'nullable'];

        return [...$rules, ...match ($this->type) {
            self::URL => ['string', 'max:2048', 'url:http,https'],
            self::TEXTAREA => ['string', 'max:10000'],
            self::HEADERS => ['string', 'max:4000'],
            self::SELECT => ['string', 'in:'.implode(',', array_column($this->options, 'value'))],
            self::TOGGLE => ['boolean'],
            default => ['string', 'max:'.($this->secret ? 2048 : 255)],
        }, ...$this->rules];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'label' => $this->label,
            'type' => $this->type,
            'required' => $this->required,
            'secret' => $this->secret,
            'help' => $this->help,
            'placeholder' => $this->placeholder,
            'options' => $this->options,
            'default' => $this->default,
        ];
    }
}
