<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\SecurityKeys\Http\Controllers\SignInController;

// Final URLs: /extensions/security-keys/{checkpoint,login}... in the web group (session, CSRF).
// Only visitors who are not signed in, throttled like the panel's own login endpoints.
Route::middleware(['guest', 'throttle:authentication'])->group(function (): void {
    Route::post('/checkpoint/options', [SignInController::class, 'checkpointOptions'])->name('checkpoint.options');
    Route::post('/checkpoint', [SignInController::class, 'checkpoint'])->name('checkpoint');
    Route::post('/login/options', [SignInController::class, 'loginOptions'])->name('login.options');
    Route::post('/login', [SignInController::class, 'login'])->name('login');
});
