<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Jobs;

use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use OlivierDutoit\Webhooks\Delivery\Sender;
use OlivierDutoit\Webhooks\Models\Delivery;
use OlivierDutoit\Webhooks\Settings;
use Throwable;

/**
 * Sends one delivery. Failures are retried with growing delays (30 s, 2 min, 10 min, 30 min,
 * then hourly) up to the configured number of attempts, a 429 waits as long as the target
 * asks, and each endpoint sends at most the configured number of requests a minute.
 */
final class DeliverWebhook implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    private const array BACKOFF = [30, 120, 600, 1800, 3600];

    /** Waiting for a rate limit releases the job too, so attempts are counted on the delivery. */
    public int $tries = 0;

    /** An exception (not a failed request, which is handled) fails the job after this many. */
    public int $maxExceptions = 3;

    public function __construct(public readonly int $deliveryId) {}

    public function retryUntil(): DateTimeInterface
    {
        return now()->addDay();
    }

    /** @return list<int> seconds before a job that threw runs again */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    /** The job gave up (out of time, or kept throwing): the delivery must not stay pending. */
    public function failed(?Throwable $exception = null): void
    {
        Delivery::query()->whereKey($this->deliveryId)->where('status', Delivery::PENDING)->update([
            'status' => Delivery::FAILED,
            'error' => 'Gave up: '.Str::limit($exception?->getMessage() ?? 'no attempt left.', 400),
        ]);
    }

    public function handle(Sender $sender): void
    {
        $delivery = Delivery::query()->with('endpoint')->find($this->deliveryId);
        if (! $delivery instanceof Delivery || $delivery->status !== Delivery::PENDING) {
            return;
        }

        if (! $delivery->endpoint->enabled) {
            $delivery->forceFill(['status' => Delivery::SKIPPED, 'error' => 'The endpoint was turned off before this was sent.'])->save();

            return;
        }

        $limiter = 'webhooks:endpoint:'.$delivery->endpoint_id;
        $perMinute = Settings::int('rate_limit', 1, 600);
        if (RateLimiter::tooManyAttempts($limiter, $perMinute)) {
            $this->release(RateLimiter::availableIn($limiter) + 1);

            return;
        }
        RateLimiter::hit($limiter, 60);

        $result = $sender->attempt($delivery);
        $final = $result->ok || $result->permanent || $delivery->attempts >= Settings::int('max_attempts', 1, 10);
        $sender->settle($delivery, $result, $final);

        if (! $final) {
            $this->release($result->retryAfter ?? self::BACKOFF[min($delivery->attempts - 1, count(self::BACKOFF) - 1)]);
        }
    }
}
