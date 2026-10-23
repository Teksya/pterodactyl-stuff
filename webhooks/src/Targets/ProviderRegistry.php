<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Targets;

use OlivierDutoit\Webhooks\Targets\Providers\Custom;
use OlivierDutoit\Webhooks\Targets\Providers\Discord;
use OlivierDutoit\Webhooks\Targets\Providers\Gotify;
use OlivierDutoit\Webhooks\Targets\Providers\Http;
use OlivierDutoit\Webhooks\Targets\Providers\Matrix;
use OlivierDutoit\Webhooks\Targets\Providers\Ntfy;
use OlivierDutoit\Webhooks\Targets\Providers\Pushover;
use OlivierDutoit\Webhooks\Targets\Providers\Slack;
use OlivierDutoit\Webhooks\Targets\Providers\Teams;
use OlivierDutoit\Webhooks\Targets\Providers\Telegram;

/** Every kind of target, in the order the editor lists them. */
final class ProviderRegistry
{
    /** @var array<string, Provider> */
    private array $providers = [];

    public function __construct()
    {
        foreach ([new Discord(), new Slack(), new Teams(), new Telegram(), new Ntfy(), new Gotify(), new Pushover(), new Matrix(), new Http(), new Custom()] as $provider) {
            $this->providers[$provider->id()] = $provider;
        }
    }

    public function find(string $id): ?Provider
    {
        return $this->providers[$id] ?? null;
    }

    /** @return array<string, Provider> */
    public function all(): array
    {
        return $this->providers;
    }

    /** @return list<array{value: string, label: string}> */
    public static function options(): array
    {
        return array_values(array_map(fn (Provider $provider): array => ['value' => $provider->id(), 'label' => $provider->label()], (new self())->all()));
    }
}
