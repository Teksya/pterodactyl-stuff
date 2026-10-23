<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OlivierDutoit\Webhooks\Scope;
use OlivierDutoit\Webhooks\Targets\ProviderRegistry;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * Where events go: a URL (Discord, Slack, any HTTP endpoint...) and the events it receives.
 *
 * @property int $id
 * @property string $uuid
 * @property Scope $scope
 * @property int|null $server_id
 * @property int|null $user_id
 * @property string $name
 * @property string $provider
 * @property array<string, mixed> $config
 * @property string $target_label
 * @property list<string> $events
 * @property array{servers?: list<int>, nodes?: list<int>}|null $filters
 * @property bool $enabled
 * @property int $failure_count
 * @property string|null $disabled_reason
 * @property CarbonInterface|null $last_delivery_at
 * @property string|null $last_status
 * @property int|null $created_by
 * @property CarbonInterface $created_at
 * @property CarbonInterface $updated_at
 * @property-read Server|null $server
 * @property-read User|null $user
 */
class Endpoint extends Model
{
    protected $table = 'webhook_endpoints';

    protected $guarded = ['id'];

    protected $hidden = ['config'];

    protected function casts(): array
    {
        return [
            'scope' => Scope::class,
            'server_id' => 'integer',
            'user_id' => 'integer',
            'config' => 'encrypted:array',
            'events' => 'array',
            'filters' => 'array',
            'enabled' => 'boolean',
            'failure_count' => 'integer',
            'last_delivery_at' => 'datetime',
            'created_by' => 'integer',
        ];
    }

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<Delivery, $this> */
    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class);
    }

    /** A config value, or the default. */
    public function option(string $key, mixed $default = null): mixed
    {
        return $this->config[$key] ?? $default;
    }

    /**
     * What the screens show: the config with every secret replaced by a mask, so an
     * edit form can send it back unchanged.
     *
     * @return array<string, mixed>
     */
    public function toPanelArray(ProviderRegistry $providers): array
    {
        $provider = $providers->find($this->provider);

        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'scope' => $this->scope->value,
            'server_id' => $this->server_id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'provider' => $this->provider,
            'config' => $provider?->mask($this->config ?? []) ?? [],
            'target' => $this->target_label,
            'events' => $this->events,
            'filters' => ['servers' => $this->filters['servers'] ?? [], 'nodes' => $this->filters['nodes'] ?? []],
            'enabled' => $this->enabled,
            'failure_count' => $this->failure_count,
            'disabled_reason' => $this->disabled_reason,
            'last_delivery_at' => $this->last_delivery_at?->toAtomString(),
            'last_status' => $this->last_status,
            'created_at' => $this->created_at->toAtomString(),
            'updated_at' => $this->updated_at->toAtomString(),
        ];
    }
}
