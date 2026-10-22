<?php

declare(strict_types=1);

namespace OlivierDutoit\SecurityKeys\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * A WebAuthn credential (security key, passkey) registered to a panel account.
 *
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property string $credential_hash
 * @property string $credential_id
 * @property string $public_key
 * @property int $sign_count
 * @property string $user_handle
 * @property string|null $aaguid
 * @property list<string>|null $transports
 * @property CarbonInterface|null $last_used_at
 * @property CarbonInterface $created_at
 * @property CarbonInterface $updated_at
 */
class SecurityKey extends Model
{
    protected $table = 'security_key_credentials';

    protected $guarded = ['id'];

    protected $hidden = ['public_key', 'credential_hash', 'user_handle'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'sign_count' => 'integer',
            'transports' => 'array',
            'last_used_at' => 'datetime',
        ];
    }

    /** The lookup hash of a raw (binary) credential id. */
    public static function hashOf(string $rawCredentialId): string
    {
        return hash('sha256', $rawCredentialId);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * What the account and admin screens show.
     *
     * @return array{id: int, name: string, created_at: string, last_used_at: string|null}
     */
    public function toPanelArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'created_at' => $this->created_at->toAtomString(),
            'last_used_at' => $this->last_used_at?->toAtomString(),
        ];
    }
}
