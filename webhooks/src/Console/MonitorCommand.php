<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Console;

use Illuminate\Console\Command;
use OlivierDutoit\Webhooks\Monitor\Monitor;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'webhooks:monitor', description: 'Poll the watched servers and nodes and send state, resource and reachability events.')]
final class MonitorCommand extends Command
{
    protected $signature = 'webhooks:monitor {--force : Run now, whatever the interval setting says}';

    protected $description = 'Poll the watched servers and nodes and send state, resource and reachability events.';

    public function handle(Monitor $monitor): int
    {
        $stats = $monitor->run((bool) $this->option('force'));
        $this->info(sprintf('Checked %d servers and %d nodes, sent %d events.', $stats['servers'], $stats['nodes'], $stats['events']));

        return self::SUCCESS;
    }
}
