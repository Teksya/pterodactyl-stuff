<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * A server's automatic snapshots: one every `interval_hours`, the last `keep` kept.
 *
 * @property int $server_id
 * @property int $interval_hours
 * @property int $keep
 * @property CarbonInterface|null $last_run_at
 * @property-read Server $server
 */
class SnapshotSchedule extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $table = 'minecraft_snapshot_schedules';

    protected $primaryKey = 'server_id';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'interval_hours' => 'integer',
            'keep' => 'integer',
            'last_run_at' => 'datetime',
        ];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function due(): bool
    {
        return $this->last_run_at === null || $this->last_run_at->copy()->addHours($this->interval_hours)->subMinutes(5)->isPast();
    }
}
