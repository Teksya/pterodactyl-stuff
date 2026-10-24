<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\AdminSidebar\Http\Controllers\LayoutController;

// Final URLs: /api/admin/extensions/admin-sidebar/...
Route::get('/layout', [LayoutController::class, 'show'])->name('layout.show');
Route::put('/layout', [LayoutController::class, 'update'])->middleware('throttle:60,1')->name('layout.update');
Route::delete('/layout', [LayoutController::class, 'destroy'])->name('layout.destroy');
