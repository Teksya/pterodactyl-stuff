<?php

declare(strict_types=1);

namespace OlivierDutoit\Minecraft\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * An archive of a server's world folders, in its .snapshots folder.
 *
 * @property int $id
 * @property string $uuid
 * @property int $server_id
 * @property string $name
 * @property list<string> $worlds
 * @property int|null $size
 * @property string|null $version
 * @property bool $automatic
 * @property string $kind manual, scheduled or safety
 * @property int|null $created_by
 * @property CarbonInterface $created_at
 * @property-read Server $server
 */
class Snapshot extends Model
{
    public const string FOLDER = '.snapshots';

    public const string MANUAL = 'manual';
    public const string SCHEDULED = 'scheduled';
    public const string SAFETY = 'safety';

    public $timestamps = false;

    protected $table = 'minecraft_snapshots';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'worlds' => 'array',
            'size' => 'integer',
            'automatic' => 'boolean',
            'created_by' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** The archive's name in the .snapshots folder. */
    public function file(): string
    {
        return $this->uuid.'.tar.gz';
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        return [
            'uuid' => $this->uuid,
            'name' => $this->name,
            'worlds' => $this->worlds,
            'size' => $this->size,
            'version' => $this->version,
            'automatic' => $this->automatic,
            'kind' => $this->kind,
            'path' => self::FOLDER.'/'.$this->file(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
