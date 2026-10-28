<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_subdomains', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('server_id');
            // Null follows the server's primary allocation.
            $table->unsignedInteger('allocation_id')->nullable();
            $table->string('name', 63);
            $table->string('domain', 191);
            // The records made at the DNS provider: [{role, id, type, name, zone}].
            $table->json('records')->nullable();
            // pending, active or error.
            $table->string('status', 16)->default('pending');
            $table->string('error', 500)->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->unique(['domain', 'name']);
            $table->index('server_id');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('allocation_id')->references('id')->on('allocations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_subdomains');
    }
};
