<?php

declare(strict_types=1);

namespace OlivierDutoit\Subdomains\Console;

use Illuminate\Console\Command;
use OlivierDutoit\Subdomains\Models\Subdomain;
use OlivierDutoit\Subdomains\Records\Syncer;
use OlivierDutoit\Subdomains\Settings;

/** Rewrites every subdomain's records, putting back those changed or deleted at the provider. */
final class SyncCommand extends Command
{
    protected $signature = 'subdomains:sync {--server= : Only the subdomains of this server id}';

    protected $description = 'Bring every subdomain\'s DNS records up to date.';

    public function handle(Syncer $syncer): int
    {
        if (Settings::token() === '') {
            $this->components->warn('No Cloudflare API token is set.');

            return self::SUCCESS;
        }

        $failed = 0;
        $query = Subdomain::query()->with('server.allocation', 'server.allocations.node', 'server.egg')
            ->when($this->option('server') !== null, fn ($query) => $query->where('server_id', (int) $this->option('server')));

        $query->chunkById(100, function ($subdomains) use ($syncer, &$failed): void {
            foreach ($subdomains as $subdomain) {
                if (! $syncer->sync($subdomain)) {
                    $failed++;
                    $this->components->error(sprintf('%s: %s', $subdomain->host(), $subdomain->error));
                }
            }
        });

        $failed === 0 ? $this->components->info('Every subdomain is up to date.') : $this->components->warn(sprintf('%d subdomain(s) failed.', $failed));

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
