<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Monitor;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Node;
use Throwable;

/**
 * How late each node's Wings reports server activity. Wings holds power actions, console
 * commands and SFTP events and sends them in a batch every `system.activity_send_interval`
 * seconds (60 by default), so a webhook hears of them that late. Each batch's oldest event
 * tells how long Wings held it; the last few batches of a node are kept.
 */
final class WingsDelay
{
    /** A delay above this, in seconds, is worth telling the administrator about. */
    public const int THRESHOLD = 20;

    private const int SAMPLES = 10;

    /** @param array<string, mixed> $input the report Wings sent */
    public static function record(Node $node, array $input): void
    {
        try {
            $oldest = null;
            foreach (is_array($input['data'] ?? null) ? $input['data'] : [] as $event) {
                $timestamp = is_array($event) && is_string($event['timestamp'] ?? null) ? CarbonImmutable::parse($event['timestamp']) : null;
                if ($timestamp !== null && ($oldest === null || $timestamp->lt($oldest))) {
                    $oldest = $timestamp;
                }
            }
            if ($oldest === null) {
                return;
            }

            $key = self::key($node->id);
            $samples = Cache::get($key, []);
            $samples[] = max(0, (int) round($oldest->diffInSeconds(CarbonImmutable::now(), false)));
            Cache::put($key, array_slice($samples, -self::SAMPLES), now()->addWeek());
        } catch (Throwable) {
            // A timestamp Wings formats in a way Carbon does not read only costs a sample.
        }
    }

    /** @return list<array{node_id: int, node: string, seconds: int}> the nodes that report late, slowest first */
    public static function slowNodes(): array
    {
        $slow = [];
        foreach (Node::query()->orderBy('name')->get(['id', 'name']) as $node) {
            $samples = Cache::get(self::key($node->id), []);
            $seconds = $samples === [] ? 0 : (int) max($samples);
            if ($seconds > self::THRESHOLD) {
                $slow[] = ['node_id' => (int) $node->id, 'node' => (string) $node->name, 'seconds' => $seconds];
            }
        }
        usort($slow, fn (array $a, array $b): int => $b['seconds'] <=> $a['seconds']);

        return $slow;
    }

    private static function key(int $nodeId): string
    {
        return 'webhooks:wings-delay:'.$nodeId;
    }
}
