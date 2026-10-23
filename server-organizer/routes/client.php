<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\ServerOrganizer\Http\Controllers\LayoutController;
use OlivierDutoit\ServerOrganizer\Http\Controllers\ServersController;
use Pterodactyl\Http\Middleware\Api\Admin\RequireSessionAuthentication;

// Final URLs: /api/client/extensions/server-organizer/...
// The dashboard's own: a panel session only.
Route::middleware(RequireSessionAuthentication::class)->group(function (): void {
    Route::get('/layout', [LayoutController::class, 'show'])->name('layout.show');
    Route::put('/layout', [LayoutController::class, 'update'])->middleware('throttle:60,1')->name('layout.update');
    Route::get('/servers', [ServersController::class, 'index'])->name('servers.index');
});
