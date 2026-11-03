<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\GitDeploy\Http\Controllers\AdminDeployController;

// Final URLs: /api/admin/extensions/git-deploy/...
Route::get('/repositories', [AdminDeployController::class, 'index'])->name('repositories.index');
