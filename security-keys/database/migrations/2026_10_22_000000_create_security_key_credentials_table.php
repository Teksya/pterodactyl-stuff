<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_key_credentials', function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('user_id');
            $table->string('name', 64);
            // A credential id can be up to 1023 bytes, more than a unique index takes, so it is
            // looked up by its SHA-256 and kept in full (base64url) beside it.
            $table->char('credential_hash', 64)->unique();
            $table->text('credential_id');
            $table->text('public_key');
            $table->unsignedBigInteger('sign_count')->default(0);
            // The WebAuthn user handle the key was registered with (base64url of 32 random bytes,
            // the same for every key of an account), returned by passwordless sign-ins.
            $table->string('user_handle', 64);
            $table->char('aaguid', 36)->nullable();
            $table->json('transports')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_key_credentials');
    }
};
