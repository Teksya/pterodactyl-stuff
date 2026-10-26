<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // manual, scheduled, or safety (taken before a restore): each kind is pruned on its own.
        Schema::table('minecraft_snapshots', function (Blueprint $table): void {
            $table->string('kind', 16)->default('manual')->after('version');
        });
        DB::table('minecraft_snapshots')->where('automatic', true)->where('name', 'like', 'Before restoring%')->update(['kind' => 'safety']);
        DB::table('minecraft_snapshots')->where('automatic', true)->where('kind', 'manual')->update(['kind' => 'scheduled']);
    }

    public function down(): void
    {
        Schema::table('minecraft_snapshots', function (Blueprint $table): void {
            $table->dropColumn('kind');
        });
    }
};
