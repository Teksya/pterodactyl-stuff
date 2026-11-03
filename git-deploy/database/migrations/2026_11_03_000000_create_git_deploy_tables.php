<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The repository a server deploys from: one per server.
        Schema::create('git_deploy_repositories', function (Blueprint $table): void {
            $table->increments('id');
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('server_id')->unique();
            // github, gitlab, gitea or generic.
            $table->string('provider', 16);
            $table->string('url', 500);
            $table->string('branch', 191)->default('main');
            // Where the files go in the server, such as / or /app.
            $table->string('directory', 191)->default('/');
            // The access token, the SSH private key and the webhook secret, encrypted as one value.
            $table->text('secrets')->nullable();
            $table->text('ssh_public_key')->nullable();
            // Paths kept from one deploy to the next, such as .env or storage/.
            $table->json('shared_paths');
            // restart, start, command or none.
            $table->string('after_deploy', 16)->default('restart');
            $table->string('command', 191)->nullable();
            $table->boolean('auto_deploy')->default(true);
            // The release whose files are in the directory now.
            $table->string('current_release', 64)->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        Schema::create('git_deploy_deployments', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->char('uuid', 36)->unique();
            $table->unsignedInteger('repository_id');
            $table->unsignedInteger('server_id');
            $table->string('branch', 191);
            $table->string('commit', 64)->nullable();
            $table->string('message', 500)->nullable();
            $table->string('author', 191)->nullable();
            // manual, push or rollback.
            $table->string('trigger', 16);
            // queued, running, success or failed.
            $table->string('status', 16)->default('queued');
            // The release this deploy made, kept in .deploy/releases/ once replaced.
            $table->string('release', 64)->nullable();
            $table->longText('log')->nullable();
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['server_id', 'id']);
            $table->foreign('repository_id')->references('id')->on('git_deploy_repositories')->cascadeOnDelete();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('git_deploy_deployments');
        Schema::dropIfExists('git_deploy_repositories');
    }
};
