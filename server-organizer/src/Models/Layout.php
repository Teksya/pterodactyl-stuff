<?php

declare(strict_types=1);

namespace OlivierDutoit\ServerOrganizer\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How one user organises their dashboard.
 *
 * @property int $user_id
 * @property array<string, mixed> $layout
 */
class Layout extends Model
{
    protected $table = 'server_organizer_layouts';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'layout' => 'array',
        ];
    }
}
