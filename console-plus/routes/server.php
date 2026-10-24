<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\ConsolePlus\Http\Controllers\PreferencesController;

// Final URLs: /api/client/servers/{server}/extensions/console-plus/...
// The stack lets the owner, root admins and every subuser in: the controller asks for websocket.connect.
Route::get('/preferences', [PreferencesController::class, 'show'])->name('preferences.show');
Route::put('/preferences', [PreferencesController::class, 'update'])->middleware('throttle:60,1')->name('preferences.update');
