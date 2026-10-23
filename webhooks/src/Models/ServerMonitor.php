<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;

/**
 * What the monitor last saw of a server, so it reports changes rather than states.
 *
 * @property int $server_id
 * @property string|null $state
 * @property bool $cpu_alert
 * @property bool $memory_alert
 * @property bool $disk_alert
 * @property CarbonInterface|null $checked_at
 */
class ServerMonitor extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $table = 'webhook_server_monitors';

    protected $primaryKey = 'server_id';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'cpu_alert' => 'boolean',
            'memory_alert' => 'boolean',
            'disk_alert' => 'boolean',
            'checked_at' => 'datetime',
        ];
    }
}
