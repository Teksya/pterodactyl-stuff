<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Http;

use Illuminate\Database\Eloquent\Builder;
use OlivierDutoit\Webhooks\Models\Endpoint;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Settings;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/** The endpoints a screen manages: the panel's, a server's or an account's. */
final readonly class Owner
{
    private function __construct(public Scope $scope, public ?Server $server = null, public ?User $user = null) {}

    public static function admin(): self
    {
        return new self(Scope::Admin);
    }

    public static function server(Server $server): self
    {
        return new self(Scope::Server, server: $server);
    }

    public static function account(User $user): self
    {
        return new self(Scope::Account, user: $user);
    }

    public static function of(Endpoint $endpoint): self
    {
        return match ($endpoint->scope) {
            Scope::Admin => self::admin(),
            Scope::Server => self::server($endpoint->server ?? abort(404)),
            Scope::Account => self::account($endpoint->user ?? abort(404)),
        };
    }

    /** @return Builder<Endpoint> */
    public function endpoints(): Builder
    {
        return Endpoint::query()
            ->where('scope', $this->scope->value)
            ->when($this->server !== null, fn (Builder $query) => $query->where('server_id', $this->server?->id))
            ->when($this->user !== null, fn (Builder $query) => $query->where('user_id', $this->user?->id));
    }

    /** Root administrators may target their own network; everyone else only the internet, unless allowed. */
    public function allowsPrivateTargets(): bool
    {
        return $this->scope === Scope::Admin || Settings::bool('private_targets');
    }

    /** @return list<string> */
    public function providers(): array
    {
        return $this->scope === Scope::Admin ? Settings::DEFAULTS['providers'] : Settings::providers();
    }

    public function limit(): ?int
    {
        return match ($this->scope) {
            Scope::Admin => null,
            Scope::Server => Settings::int('max_per_server', 0, 1000),
            Scope::Account => Settings::int('max_per_account', 0, 1000),
        };
    }

    /** The prefix of the activity entries logged when these endpoints change. */
    public function activityPrefix(): string
    {
        return match ($this->scope) {
            Scope::Admin => 'admin',
            Scope::Server => 'server',
            Scope::Account => 'user',
        };
    }
}
