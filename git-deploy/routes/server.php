<?php

use Illuminate\Support\Facades\Route;
use OlivierDutoit\GitDeploy\Http\Controllers\ServerDeployController;

// Final URLs: /api/client/servers/{server}/extensions/git-deploy/...
// The stack lets the owner, root admins and every subuser in: the controller checks
// ext.git-deploy.read, .deploy or .manage.
Route::get('/meta', [ServerDeployController::class, 'meta'])->name('meta');
Route::put('/repository', [ServerDeployController::class, 'save'])->middleware('throttle:20,1')->name('repository.save');
Route::delete('/repository', [ServerDeployController::class, 'destroy'])->name('repository.destroy');
Route::post('/repository/key', [ServerDeployController::class, 'key'])->middleware('throttle:10,1')->name('repository.key');
Route::post('/repository/secret', [ServerDeployController::class, 'secret'])->middleware('throttle:10,1')->name('repository.secret');
Route::get('/commits', [ServerDeployController::class, 'commits'])->middleware('throttle:30,1')->name('commits');
Route::post('/deploy', [ServerDeployController::class, 'deploy'])->middleware('throttle:20,1')->name('deploy');
Route::get('/deployments', [ServerDeployController::class, 'deployments'])->name('deployments.index');
Route::get('/deployments/{deployment}', [ServerDeployController::class, 'show'])->whereNumber('deployment')->name('deployments.show');
Route::post('/deployments/{deployment}/rollback', [ServerDeployController::class, 'rollback'])->whereNumber('deployment')->middleware('throttle:20,1')->name('deployments.rollback');
