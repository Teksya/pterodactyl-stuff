<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\ConsolePlus\Http\Controllers\GameController;
use OlivierDutoit\ConsolePlus\Http\Controllers\PreferencesController;

// Final URLs: /api/client/servers/{server}/extensions/console-plus/...
// The stack lets the owner, root admins and every subuser in: the controllers ask for websocket.connect.
Route::get('/preferences', [PreferencesController::class, 'show'])->name('preferences.show');
Route::put('/preferences', [PreferencesController::class, 'update'])->middleware('throttle:60,1')->name('preferences.update');
Route::get('/game', [GameController::class, 'show'])->name('game.show');
