<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Why the last automatic snapshot failed, and when; cleared once one is taken.
        Schema::table('minecraft_snapshot_schedules', function (Blueprint $table): void {
            $table->string('last_error', 900)->nullable()->after('last_run_at');
            $table->timestamp('last_error_at')->nullable()->after('last_error');
        });
    }

    public function down(): void
    {
        Schema::table('minecraft_snapshot_schedules', function (Blueprint $table): void {
            $table->dropColumn(['last_error', 'last_error_at']);
        });
    }
};
