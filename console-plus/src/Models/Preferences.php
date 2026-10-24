<?php

declare(strict_types=1);

namespace OlivierDutoit\ConsolePlus\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How one user reads one server's console.
 *
 * @property int $user_id
 * @property int $server_id
 * @property array<string, mixed> $preferences
 */
class Preferences extends Model
{
    protected $table = 'console_plus_preferences';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'server_id' => 'integer',
            'preferences' => 'array',
        ];
    }
}
