<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_endpoints', function (Blueprint $table): void {
            $table->increments('id');
            $table->char('uuid', 36)->unique();
            // admin (the whole panel), server (one server) or account (one user's account).
            $table->string('scope', 16);
            $table->unsignedInteger('server_id')->nullable();
            $table->unsignedInteger('user_id')->nullable();
            $table->string('name', 100);
            $table->string('provider', 32);
            // The target URL and the provider's options, secrets included, encrypted as one value.
            $table->text('config');
            // What lists show of the target without decrypting it, such as its host.
            $table->string('target_label', 191)->default('');
            $table->json('events');
            // Admin endpoints only: limit server events to some servers or nodes.
            $table->json('filters')->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('failure_count')->default(0);
            $table->string('disabled_reason', 255)->nullable();
            $table->timestamp('last_delivery_at')->nullable();
            $table->string('last_status', 16)->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['scope', 'enabled']);
            $table->index('server_id');
            $table->index('user_id');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('webhook_deliveries', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('endpoint_id');
            $table->string('event', 191);
            $table->longText('payload');
            // pending, success, failed or skipped.
            $table->string('status', 16)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->text('response_body')->nullable();
            $table->string('error', 500)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->boolean('is_test')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('delivered_at')->nullable();

            $table->index(['endpoint_id', 'id']);
            $table->index('created_at');
            $table->foreign('endpoint_id')->references('id')->on('webhook_endpoints')->cascadeOnDelete();
        });

        // The last state and resource alerts the monitor saw for each server it watches.
        Schema::create('webhook_server_monitors', function (Blueprint $table): void {
            $table->unsignedInteger('server_id')->primary();
            $table->string('state', 16)->nullable();
            $table->boolean('cpu_alert')->default(false);
            $table->boolean('memory_alert')->default(false);
            $table->boolean('disk_alert')->default(false);
            $table->timestamp('checked_at')->nullable();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_server_monitors');
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhook_endpoints');
    }
};
