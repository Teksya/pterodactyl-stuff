<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Subdomains\Http\Controllers\ServerSubdomainsController;

// Final URLs: /api/client/servers/{server}/extensions/subdomains/...
// The stack lets the owner, root admins and every subuser in: the controller checks
// ext.subdomains.read, and ext.subdomains.manage for changes.
Route::get('/meta', [ServerSubdomainsController::class, 'meta'])->name('meta');
Route::get('/subdomains', [ServerSubdomainsController::class, 'index'])->name('subdomains.index');
Route::get('/available', [ServerSubdomainsController::class, 'available'])->middleware('throttle:60,1')->name('available');
Route::post('/subdomains', [ServerSubdomainsController::class, 'store'])->middleware('throttle:10,1')->name('subdomains.store');
Route::patch('/subdomains/{subdomain}', [ServerSubdomainsController::class, 'update'])->whereNumber('subdomain')->middleware('throttle:20,1')->name('subdomains.update');
Route::delete('/subdomains/{subdomain}', [ServerSubdomainsController::class, 'destroy'])->whereNumber('subdomain')->name('subdomains.destroy');
Route::post('/subdomains/{subdomain}/sync', [ServerSubdomainsController::class, 'sync'])->whereNumber('subdomain')->middleware('throttle:10,1')->name('subdomains.sync');
