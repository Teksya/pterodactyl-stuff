<?php

declare(strict_types=1);

namespace OlivierDutoit\AdminSidebar\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The admin area's navigation as the administrators arranged it. The table holds one row.
 *
 * @property array<string, mixed> $layout
 */
class Layout extends Model
{
    protected $table = 'admin_sidebar_layouts';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['layout' => 'array'];
    }
}
