<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each snapshot is an archive of world folders in the server's .snapshots folder.
        Schema::create('minecraft_snapshots', function (Blueprint $table): void {
            $table->increments('id');
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('server_id');
            $table->string('name', 100);
            // The world folders in the archive, such as ["world", "world_nether"].
            $table->json('worlds');
            $table->unsignedBigInteger('size')->nullable();
            // The game version the worlds were saved with.
            $table->string('version', 32)->nullable();
            // Taken by the schedule or before a restore: pruned first.
            $table->boolean('automatic')->default(false);
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['server_id', 'created_at']);
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        Schema::create('minecraft_snapshot_schedules', function (Blueprint $table): void {
            $table->unsignedInteger('server_id')->primary();
            $table->unsignedSmallInteger('interval_hours');
            // How many automatic snapshots to keep.
            $table->unsignedSmallInteger('keep');
            $table->timestamp('last_run_at')->nullable();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('minecraft_snapshot_schedules');
        Schema::dropIfExists('minecraft_snapshots');
    }
};
