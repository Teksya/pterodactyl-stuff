<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Jobs;

use OlivierDutoit\Webhooks\Delivery\Dispatcher;
use OlivierDutoit\Webhooks\Events\EventBuilder;
use OlivierDutoit\Webhooks\Monitor\WingsDelay;
use Pterodactyl\Contracts\Activity\IngestsActivityLogs;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The activity Wings reports (power and commands sent from the console, SFTP, its own file
 * operations) is written in bulk, without the model events ActivityLogged rides on. This
 * wraps the panel's ingestion and queues the deliveries of the entries it wrote.
 */
final readonly class IngestedActivity implements IngestsActivityLogs
{
    public function __construct(private IngestsActivityLogs $inner) {}

    public function ingest(Node $node, array $input): void
    {
        WingsDelay::record($node, $input);
        $before = (int) ActivityLog::query()->max('id');

        $this->inner->ingest($node, $input);

        try {
            if (! Dispatcher::hasEndpoints()) {
                return;
            }

            $ids = ActivityLog::query()
                ->where('id', '>', $before)
                ->where('event', 'like', 'server:%')
                ->whereHas('subjects', fn ($query) => $query
                    ->where('subject_type', (new Server())->getMorphClass())
                    ->whereIn('subject_id', $node->servers()->select('id')))
                ->orderBy('id')
                ->pluck('id');

            // Wings already waited to send its report and nobody waits on this request: the
            // deliveries are queued here rather than after one more trip through the queue.
            $builder = app(EventBuilder::class);
            $dispatcher = app(Dispatcher::class);
            foreach ($ids as $id) {
                ProcessActivity::process((int) $id, $builder, $dispatcher);
            }
        } catch (Throwable $exception) {
            // The activity is recorded either way; Wings must not resend it because a webhook failed.
            report($exception);
        }
    }
}
