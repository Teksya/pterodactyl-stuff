<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\Server;

/**
 * The repository a server deploys from.
 *
 * @property int $id
 * @property string $uuid
 * @property int $server_id
 * @property string $provider
 * @property string $url
 * @property string $branch
 * @property string $directory
 * @property array{token?: string|null, ssh_private_key?: string|null, webhook_secret?: string|null}|null $secrets
 * @property string|null $ssh_public_key
 * @property list<string> $shared_paths
 * @property string $after_deploy
 * @property string|null $command
 * @property bool $auto_deploy
 * @property string|null $current_release
 * @property int|null $created_by
 * @property CarbonInterface $created_at
 * @property CarbonInterface $updated_at
 * @property-read Server $server
 */
class Repository extends Model
{
    public const array AFTER_DEPLOY = ['restart', 'start', 'command', 'none'];

    protected $table = 'git_deploy_repositories';

    protected $guarded = ['id'];

    protected $hidden = ['secrets'];

    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'secrets' => 'encrypted:array',
            'shared_paths' => 'array',
            'auto_deploy' => 'boolean',
            'created_by' => 'integer',
        ];
    }

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return HasMany<Deployment, $this> */
    public function deployments(): HasMany
    {
        return $this->hasMany(Deployment::class);
    }

    public function secret(string $key): ?string
    {
        $value = ($this->secrets ?? [])[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /** The directory, as an absolute path without a trailing slash, / for the server's root. */
    public function root(): string
    {
        $directory = '/'.trim($this->directory, '/');

        return $directory === '/' ? '/' : $directory;
    }

    /** A path inside the directory. */
    public function path(string $relative): string
    {
        return rtrim($this->root(), '/').'/'.ltrim($relative, '/');
    }
}
