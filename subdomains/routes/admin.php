<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Subdomains\Http\Controllers\AdminSubdomainsController;

// Final URLs: /api/admin/extensions/subdomains/... ("serverId", not "server", which the panel
// binds to a model of its own).
Route::get('/subdomains', [AdminSubdomainsController::class, 'all'])->name('subdomains.index');
Route::get('/check', [AdminSubdomainsController::class, 'check'])->middleware('throttle:20,1')->name('check');
Route::get('/available', [AdminSubdomainsController::class, 'available'])->name('available');
Route::patch('/subdomains/{subdomain}', [AdminSubdomainsController::class, 'update'])->whereNumber('subdomain')->name('subdomains.update');
Route::delete('/subdomains/{subdomain}', [AdminSubdomainsController::class, 'destroy'])->whereNumber('subdomain')->name('subdomains.destroy');
Route::post('/subdomains/{subdomain}/sync', [AdminSubdomainsController::class, 'sync'])->whereNumber('subdomain')->name('subdomains.sync');

Route::get('/servers/{serverId}/meta', [AdminSubdomainsController::class, 'meta'])->whereNumber('serverId')->name('servers.meta');
Route::get('/servers/{serverId}/subdomains', [AdminSubdomainsController::class, 'index'])->whereNumber('serverId')->name('servers.subdomains.index');
Route::post('/servers/{serverId}/subdomains', [AdminSubdomainsController::class, 'store'])->whereNumber('serverId')->name('servers.subdomains.store');
