<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * One deploy or rollback, with what it did, line by line.
 *
 * @property int $id
 * @property string $uuid
 * @property int $repository_id
 * @property int $server_id
 * @property string $branch
 * @property string|null $commit
 * @property string|null $message
 * @property string|null $author
 * @property string $trigger
 * @property string $status
 * @property string|null $release
 * @property string|null $log
 * @property int|null $created_by
 * @property CarbonInterface|null $started_at
 * @property CarbonInterface|null $finished_at
 * @property CarbonInterface $created_at
 * @property-read Repository $repository
 * @property-read User|null $creator
 */
class Deployment extends Model
{
    public const string QUEUED = 'queued';

    public const string RUNNING = 'running';

    public const string SUCCESS = 'success';

    public const string FAILED = 'failed';

    protected $table = 'git_deploy_deployments';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'repository_id' => 'integer',
            'server_id' => 'integer',
            'created_by' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Repository, $this> */
    public function repository(): BelongsTo
    {
        return $this->belongsTo(Repository::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Adds a timestamped line to the log and saves it, so the page can follow the deploy. */
    public function line(string $text): void
    {
        $this->log = ltrim(($this->log ?? '')."\n".now()->format('H:i:s').'  '.$text);
        $this->save();
    }

    public function finished(): bool
    {
        return $this->status === self::SUCCESS || $this->status === self::FAILED;
    }
}
