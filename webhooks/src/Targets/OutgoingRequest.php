<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

/** The HTTP request a provider wants sent for one delivery. */
final readonly class OutgoingRequest
{
    /** @param array<string, string> $headers */
    public function __construct(
        public string $method,
        public string $url,
        public array $headers = [],
        public ?string $body = null,
    ) {}

    /** @param array<string, mixed> $data */
    public static function json(string $url, array $data, array $headers = [], string $method = 'POST'): self
    {
        return new self($method, $url, ['Content-Type' => 'application/json', ...$headers], self::encode($data));
    }

    /** @param array<string, mixed> $data */
    public static function encode(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    }
}
