<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Webhooks\Http\Controllers\AdminWebhooksController;

// Final URLs: /api/admin/extensions/webhooks/... ("serverId" and "userId", not "server" and
// "user", which the panel binds to models of its own).
Route::get('/meta', [AdminWebhooksController::class, 'meta'])->name('meta');
Route::get('/targets', [AdminWebhooksController::class, 'targets'])->name('targets');
Route::get('/webhooks', [AdminWebhooksController::class, 'index'])->name('webhooks.index');
Route::get('/webhooks/all', [AdminWebhooksController::class, 'all'])->name('webhooks.all');
Route::post('/webhooks', [AdminWebhooksController::class, 'store'])->name('webhooks.store');
Route::patch('/webhooks/{endpoint}', [AdminWebhooksController::class, 'update'])->whereNumber('endpoint')->name('webhooks.update');
Route::delete('/webhooks/{endpoint}', [AdminWebhooksController::class, 'destroy'])->whereNumber('endpoint')->name('webhooks.destroy');
Route::post('/webhooks/{endpoint}/test', [AdminWebhooksController::class, 'test'])->whereNumber('endpoint')->name('webhooks.test');
Route::get('/webhooks/{endpoint}/deliveries', [AdminWebhooksController::class, 'deliveries'])->whereNumber('endpoint')->name('webhooks.deliveries');
Route::get('/deliveries', [AdminWebhooksController::class, 'log'])->name('deliveries.index');
Route::get('/deliveries/{delivery}', [AdminWebhooksController::class, 'delivery'])->whereNumber('delivery')->name('deliveries.show');
Route::post('/deliveries/{delivery}/redeliver', [AdminWebhooksController::class, 'redeliver'])->whereNumber('delivery')->name('deliveries.redeliver');

Route::get('/servers/{serverId}/meta', [AdminWebhooksController::class, 'meta'])->whereNumber('serverId')->name('servers.meta');
Route::get('/servers/{serverId}/webhooks', [AdminWebhooksController::class, 'index'])->whereNumber('serverId')->name('servers.webhooks.index');
Route::post('/servers/{serverId}/webhooks', [AdminWebhooksController::class, 'store'])->whereNumber('serverId')->name('servers.webhooks.store');
Route::get('/users/{userId}/meta', [AdminWebhooksController::class, 'meta'])->whereNumber('userId')->name('users.meta');
Route::get('/users/{userId}/webhooks', [AdminWebhooksController::class, 'index'])->whereNumber('userId')->name('users.webhooks.index');
Route::post('/users/{userId}/webhooks', [AdminWebhooksController::class, 'store'])->whereNumber('userId')->name('users.webhooks.store');
