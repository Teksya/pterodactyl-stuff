<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\SecurityKeys\Http\Controllers\AccountKeysController;
use Pterodactyl\Http\Middleware\Api\Admin\RequireSessionAuthentication;

// Final URLs: /api/client/extensions/security-keys/keys...
// A panel session only: an account API key must not be able to add or remove sign-in keys.
Route::middleware(RequireSessionAuthentication::class)->group(function (): void {
    Route::get('/keys', [AccountKeysController::class, 'index'])->name('keys.index');
    Route::post('/keys/options', [AccountKeysController::class, 'options'])->middleware('throttle:authentication')->name('keys.options');
    Route::post('/keys', [AccountKeysController::class, 'store'])->name('keys.store');
    Route::patch('/keys/{key}', [AccountKeysController::class, 'update'])->whereNumber('key')->name('keys.update');
    Route::delete('/keys/{key}', [AccountKeysController::class, 'destroy'])->whereNumber('key')->middleware('throttle:authentication')->name('keys.destroy');
});
