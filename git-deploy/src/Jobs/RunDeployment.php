<?php

declare(strict_types=1);

namespace OlivierDutoit\GitDeploy\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use OlivierDutoit\GitDeploy\Deploy\Deployer;
use OlivierDutoit\GitDeploy\Models\Deployment;
use Throwable;

/** Runs a deploy, or a rollback to `$release`, one at a time per server. */
final class RunDeployment implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 900;

    public function __construct(public readonly int $deployment, public readonly ?string $release = null) {}

    public function handle(Deployer $deployer): void
    {
        $deployment = Deployment::query()->with('repository.server.node', 'repository.server.user')->find($this->deployment);
        if ($deployment === null || $deployment->finished()) {
            return;
        }

        $lock = Cache::lock('git-deploy:server:'.$deployment->server_id, $this->timeout);
        try {
            $lock->block(600);
        } catch (LockTimeoutException) {
            $deployment->line('Failed: another deploy of this server did not finish in time.');
            $deployment->forceFill(['status' => Deployment::FAILED, 'finished_at' => now()])->save();

            return;
        }

        try {
            $this->release === null ? $deployer->deploy($deployment) : $deployer->rollback($deployment, $this->release);
        } finally {
            $lock->release();
        }
    }

    public function failed(Throwable $exception): void
    {
        $deployment = Deployment::query()->find($this->deployment);
        if ($deployment !== null && ! $deployment->finished()) {
            $deployment->line('Failed: '.mb_substr($exception->getMessage(), 0, 500));
            $deployment->forceFill(['status' => Deployment::FAILED, 'finished_at' => now()])->save();
        }
    }
}
