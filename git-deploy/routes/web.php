<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\GitDeploy\Http\Controllers\HookController;

// Final URL: /extensions/git-deploy/hooks/{repository}, which forges call on every push.
// Stateless, without the web group (no session, no CSRF token): the secret authenticates the call.
Route::post('/hooks/{repository}', HookController::class)
    ->withoutMiddleware(['web'])
    ->middleware('throttle:60,1')
    ->where('repository', '[0-9a-f-]{36}')
    ->name('hook');
