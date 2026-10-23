<?php

declare(strict_types=1);

namespace OlivierDutoit\Webhooks\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One event sent (or to be sent) to one endpoint, with the payload as built and what the
 * target answered. Kept for the delivery log until the retention setting prunes it.
 *
 * @property int $id
 * @property string $uuid
 * @property int $endpoint_id
 * @property string $event
 * @property array<string, mixed> $payload
 * @property string $status
 * @property int $attempts
 * @property int|null $response_status
 * @property string|null $response_body
 * @property string|null $error
 * @property int|null $duration_ms
 * @property bool $is_test
 * @property CarbonInterface $created_at
 * @property CarbonInterface|null $delivered_at
 * @property-read Endpoint $endpoint
 */
class Delivery extends Model
{
    public const string PENDING = 'pending';

    public const string SUCCESS = 'success';

    public const string FAILED = 'failed';

    public const string SKIPPED = 'skipped';

    public const UPDATED_AT = null;

    protected $table = 'webhook_deliveries';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'endpoint_id' => 'integer',
            'payload' => 'array',
            'attempts' => 'integer',
            'response_status' => 'integer',
            'duration_ms' => 'integer',
            'is_test' => 'boolean',
            'delivered_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Endpoint, $this> */
    public function endpoint(): BelongsTo
    {
        return $this->belongsTo(Endpoint::class);
    }

    /**
     * The delivery log row; the payload and the response only with `$detail`.
     *
     * @return array<string, mixed>
     */
    public function toPanelArray(bool $detail = false): array
    {
        $row = [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'endpoint_id' => $this->endpoint_id,
            'event' => $this->event,
            'status' => $this->status,
            'attempts' => $this->attempts,
            'response_status' => $this->response_status,
            'error' => $this->error,
            'duration_ms' => $this->duration_ms,
            'is_test' => $this->is_test,
            'created_at' => $this->created_at->toAtomString(),
            'delivered_at' => $this->delivered_at?->toAtomString(),
        ];

        if ($detail) {
            $row['payload'] = $this->payload;
            $row['response_body'] = $this->response_body;
        }

        return $row;
    }
}
