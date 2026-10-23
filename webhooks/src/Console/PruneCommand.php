<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Console;

use Illuminate\Console\Command;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Settings;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'webhooks:prune', description: 'Delete delivery log entries older than the retention setting.')]
final class PruneCommand extends Command
{
    protected $signature = 'webhooks:prune';

    protected $description = 'Delete delivery log entries older than the retention setting.';

    public function handle(): int
    {
        $before = now()->subDays(Settings::int('retention_days', 1, 365));
        // A delivery still pending a day after retries stopped never will be sent (no queue worker, lost job).
        $stuck = $before->copy()->subDay();
        $deleted = 0;

        do {
            $batch = Delivery::query()
                ->where('created_at', '<', $before)
                ->where(fn ($query) => $query->where('status', '!=', Delivery::PENDING)->orWhere('created_at', '<', $stuck))
                ->limit(1000)
                ->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info(sprintf('Deleted %d delivery log entries.', $deleted));

        return self::SUCCESS;
    }
}
