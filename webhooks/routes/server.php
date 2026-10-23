<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Webhooks\Http\Controllers\ServerWebhooksController;

// Final URLs: /api/client/servers/{server}/extensions/webhooks/...
// The stack lets the owner, root admins and every subuser in: the controller checks
// ext.webhooks.read, and ext.webhooks.manage with activity.read for changes.
Route::get('/meta', [ServerWebhooksController::class, 'meta'])->name('meta');
Route::get('/webhooks', [ServerWebhooksController::class, 'index'])->name('webhooks.index');
Route::post('/webhooks', [ServerWebhooksController::class, 'store'])->middleware('throttle:20,1')->name('webhooks.store');
Route::patch('/webhooks/{endpoint}', [ServerWebhooksController::class, 'update'])->whereNumber('endpoint')->name('webhooks.update');
Route::delete('/webhooks/{endpoint}', [ServerWebhooksController::class, 'destroy'])->whereNumber('endpoint')->name('webhooks.destroy');
Route::post('/webhooks/{endpoint}/test', [ServerWebhooksController::class, 'test'])->whereNumber('endpoint')->middleware('throttle:20,1')->name('webhooks.test');
Route::get('/webhooks/{endpoint}/deliveries', [ServerWebhooksController::class, 'deliveries'])->whereNumber('endpoint')->name('webhooks.deliveries');
Route::get('/deliveries/{delivery}', [ServerWebhooksController::class, 'delivery'])->whereNumber('delivery')->name('deliveries.show');
Route::post('/deliveries/{delivery}/redeliver', [ServerWebhooksController::class, 'redeliver'])->whereNumber('delivery')->middleware('throttle:20,1')->name('deliveries.redeliver');
