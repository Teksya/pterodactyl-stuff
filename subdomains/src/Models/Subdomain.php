<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;

/**
 * A name under one of the offered domains, such as play under example.com, pointing at a
 * server's allocation.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $allocation_id
 * @property string $name
 * @property string $domain
 * @property list<array{role: string, id: string, type: string, name: string, zone: string}>|null $records
 * @property string $status
 * @property string|null $error
 * @property CarbonInterface|null $synced_at
 * @property int|null $created_by
 * @property CarbonInterface $created_at
 * @property CarbonInterface $updated_at
 * @property-read Server $server
 * @property-read Allocation|null $allocation
 */
class Subdomain extends Model
{
    public const string PENDING = 'pending';

    public const string ACTIVE = 'active';

    public const string ERROR = 'error';

    protected $table = 'server_subdomains';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'allocation_id' => 'integer',
            'records' => 'array',
            'synced_at' => 'datetime',
            'created_by' => 'integer',
        ];
    }

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return BelongsTo<Allocation, $this> */
    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class);
    }

    public function host(): string
    {
        return $this->name.'.'.$this->domain;
    }

    /** @return list<array{zone: string, id: string}> */
    public function recordRefs(): array
    {
        return array_values(array_map(fn (array $record): array => ['zone' => $record['zone'], 'id' => $record['id']], $this->records ?? []));
    }
}
