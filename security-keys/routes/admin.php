<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\SecurityKeys\Http\Controllers\AdminUserKeysController;

// Final URLs ("{account}", not "{user}", which the client API binds to a model): /api/admin/extensions/security-keys/users/{account}/keys...
Route::get('/users/{account}/keys', [AdminUserKeysController::class, 'index'])->whereNumber('account')->name('users.keys.index');
Route::delete('/users/{account}/keys/{key}', [AdminUserKeysController::class, 'destroy'])->whereNumber(['account', 'key'])->name('users.keys.destroy');
