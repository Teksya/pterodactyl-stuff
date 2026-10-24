<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row: the admin area's navigation as the administrators arranged it.
        Schema::create('admin_sidebar_layouts', function (Blueprint $table): void {
            $table->increments('id');
            $table->json('layout');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_sidebar_layouts');
    }
};
