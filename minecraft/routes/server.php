<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\Minecraft\Http\MinecraftController;
use OlivierDutoit\Minecraft\Http\WorldsController;

// Final URLs: /api/client/servers/{server}/extensions/minecraft/...
// Every subuser gets this far; the controller checks the panel's and the extension's permissions.
Route::get('/overview', [MinecraftController::class, 'overview'])->name('overview');
Route::get('/players', [MinecraftController::class, 'players'])->name('players');
Route::post('/players/add', [MinecraftController::class, 'add'])->middleware('throttle:30,1')->name('players.add');
Route::get('/players/{uuid}', [MinecraftController::class, 'player'])->name('players.show');
Route::post('/players/{uuid}/actions', [MinecraftController::class, 'playerAction'])->middleware('throttle:60,1')->name('players.actions');
Route::get('/ip-bans', [MinecraftController::class, 'ipBans'])->name('ip-bans');
Route::post('/ip-bans', [MinecraftController::class, 'ipBan'])->middleware('throttle:30,1')->name('ip-bans.change');
Route::post('/broadcast', [MinecraftController::class, 'broadcast'])->middleware('throttle:20,1')->name('broadcast');
Route::post('/rcon', [MinecraftController::class, 'enableRcon'])->middleware('throttle:10,1')->name('rcon.enable');
Route::get('/world', [MinecraftController::class, 'world'])->name('world');
Route::post('/world/actions', [MinecraftController::class, 'worldAction'])->middleware('throttle:60,1')->name('world.actions');
Route::post('/icon', [MinecraftController::class, 'icon'])->middleware('throttle:10,1')->name('icon');

// Worlds and snapshots: WorldsController.
Route::get('/worlds', [WorldsController::class, 'index'])->name('worlds');
Route::post('/worlds/activate', [WorldsController::class, 'activate'])->middleware('throttle:20,1')->name('worlds.activate');
Route::post('/worlds/create', [WorldsController::class, 'create'])->middleware('throttle:20,1')->name('worlds.create');
Route::post('/worlds/delete', [WorldsController::class, 'deleteWorld'])->middleware('throttle:20,1')->name('worlds.delete');
Route::post('/snapshots', [WorldsController::class, 'take'])->middleware('throttle:10,1')->name('snapshots.take');
Route::put('/snapshots/schedule', [WorldsController::class, 'schedule'])->middleware('throttle:20,1')->name('snapshots.schedule');
Route::post('/snapshots/{uuid}/restore', [WorldsController::class, 'restore'])->middleware('throttle:10,1')->name('snapshots.restore');
Route::delete('/snapshots/{uuid}', [WorldsController::class, 'destroy'])->middleware('throttle:20,1')->name('snapshots.destroy');
