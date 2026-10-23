<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Webhooks\Http\Controllers\AccountWebhooksController;
use Pterodactyl\Http\Middleware\Api\Admin\RequireSessionAuthentication;

// Final URLs: /api/client/extensions/webhooks/...
// A panel session only: an account API key must not be able to send the account's sign-ins elsewhere.
Route::middleware(RequireSessionAuthentication::class)->group(function (): void {
    Route::get('/meta', [AccountWebhooksController::class, 'meta'])->name('meta');
    Route::get('/webhooks', [AccountWebhooksController::class, 'index'])->name('webhooks.index');
    Route::post('/webhooks', [AccountWebhooksController::class, 'store'])->middleware('throttle:20,1')->name('webhooks.store');
    Route::patch('/webhooks/{endpoint}', [AccountWebhooksController::class, 'update'])->whereNumber('endpoint')->name('webhooks.update');
    Route::delete('/webhooks/{endpoint}', [AccountWebhooksController::class, 'destroy'])->whereNumber('endpoint')->name('webhooks.destroy');
    Route::post('/webhooks/{endpoint}/test', [AccountWebhooksController::class, 'test'])->whereNumber('endpoint')->middleware('throttle:20,1')->name('webhooks.test');
    Route::get('/webhooks/{endpoint}/deliveries', [AccountWebhooksController::class, 'deliveries'])->whereNumber('endpoint')->name('webhooks.deliveries');
    Route::get('/deliveries/{delivery}', [AccountWebhooksController::class, 'delivery'])->whereNumber('delivery')->name('deliveries.show');
    Route::post('/deliveries/{delivery}/redeliver', [AccountWebhooksController::class, 'redeliver'])->whereNumber('delivery')->middleware('throttle:20,1')->name('deliveries.redeliver');
});
