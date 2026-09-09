<?php

use App\Http\Controllers\Api\AcademicMasterController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookController;
use App\Http\Controllers\Api\BookCopyController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CirculationController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FineController;
use App\Http\Controllers\Api\LoanPolicyController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\StudentRegistrationController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\UserImportController;
use Illuminate\Support\Facades\Route;

Route::get('/registration/options', [StudentRegistrationController::class, 'options'])->middleware('throttle:30,1');
Route::post('/registration', [StudentRegistrationController::class, 'store'])->middleware('throttle:5,1');

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/dashboard', DashboardController::class);
    Route::get('/profile', [UserController::class, 'profile']);
    Route::put('/profile', [UserController::class, 'updateProfile']);
    Route::post('/profile', [UserController::class, 'updateProfile']);
    Route::get('/profile/card', [UserController::class, 'card']);

    Route::get('/academic', [AcademicMasterController::class, 'index'])->middleware('permission:academic.manage');
    Route::post('/academic/years', [AcademicMasterController::class, 'storeYear'])->middleware('permission:academic.manage');
    Route::post('/academic/levels', [AcademicMasterController::class, 'storeLevel'])->middleware('permission:academic.manage');
    Route::post('/academic/majors', [AcademicMasterController::class, 'storeMajor'])->middleware('permission:academic.manage');
    Route::post('/academic/classes', [AcademicMasterController::class, 'storeClass'])->middleware('permission:academic.manage');
    Route::patch('/academic/{type}/{id}/toggle', [AcademicMasterController::class, 'toggle'])->middleware('permission:academic.manage');

    Route::get('/users', [UserController::class, 'index'])->middleware('permission:users.view');
    Route::post('/users', [UserController::class, 'store'])->middleware('permission:users.create');
    Route::get('/users/{user}', [UserController::class, 'show'])->middleware('permission:users.view');
    Route::put('/users/{user}', [UserController::class, 'update'])->middleware('permission:users.update');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])->middleware('permission:users.delete');
    Route::get('/users/{user}/card', [UserController::class, 'card'])->middleware('permission:users.view');
    Route::post('/users/{user}/rotate-qr', [UserController::class, 'rotateQr'])->middleware('permission:users.update');
    Route::post('/imports/users', [UserImportController::class, 'store'])->middleware('permission:users.create');
    Route::get('/imports/users/template', [UserImportController::class, 'template'])->middleware('permission:users.create');
    Route::get('/imports/users/{importJob}', [UserImportController::class, 'show'])->middleware('permission:users.view');

    Route::get('/roles-permissions', [RolePermissionController::class, 'index'])->middleware('permission:roles.manage');
    Route::put('/roles/{role}/permissions', [RolePermissionController::class, 'update'])->middleware('permission:roles.manage');

    Route::get('/categories', [CategoryController::class, 'index'])->middleware('permission:catalog.view');
    Route::post('/categories', [CategoryController::class, 'store'])->middleware('permission:catalog.create');
    Route::put('/categories/{category}', [CategoryController::class, 'update'])->middleware('permission:catalog.update');
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->middleware('permission:catalog.delete');

    Route::get('/books', [BookController::class, 'index'])->middleware('permission:catalog.view');
    Route::post('/books', [BookController::class, 'store'])->middleware('permission:catalog.create');
    Route::get('/books/{book}', [BookController::class, 'show'])->middleware('permission:catalog.view');
    Route::put('/books/{book}', [BookController::class, 'update'])->middleware('permission:catalog.update');
    Route::delete('/books/{book}', [BookController::class, 'destroy'])->middleware('permission:catalog.delete');

    Route::get('/book-copies/lookup', [BookCopyController::class, 'lookup'])->middleware('permission:catalog.view');
    Route::post('/book-copies/labels', [BookCopyController::class, 'labels'])->middleware('permission:catalog.update');
    Route::get('/book-copies', [BookCopyController::class, 'index'])->middleware('permission:catalog.view');
    Route::post('/book-copies', [BookCopyController::class, 'store'])->middleware('permission:catalog.create');
    Route::put('/book-copies/{bookCopy}', [BookCopyController::class, 'update'])->middleware('permission:catalog.update');
    Route::delete('/book-copies/{bookCopy}', [BookCopyController::class, 'destroy'])->middleware('permission:catalog.delete');

    Route::post('/loans/borrow', [CirculationController::class, 'borrow'])->middleware('permission:circulation.borrow');
    Route::post('/loans/return', [CirculationController::class, 'returnBook'])->middleware('permission:circulation.return');
    Route::get('/loans/active', [CirculationController::class, 'active']);
    Route::get('/loans/history', [CirculationController::class, 'history']);

    Route::get('/fines', [FineController::class, 'index']);
    Route::post('/fines/{fine}/payments', [FineController::class, 'pay'])->middleware('permission:fines.pay');
    Route::post('/fines/{fine}/waive', [FineController::class, 'waive'])->middleware('permission:fines.waive');

    Route::get('/settings/loan-policies', [LoanPolicyController::class, 'index'])->middleware('permission:settings.view|settings.manage');
    Route::put('/settings/loan-policies/{loanPolicy}', [LoanPolicyController::class, 'update'])->middleware('permission:settings.manage');
    Route::get('/reports/export', [ReportController::class, 'export'])->middleware('permission:reports.view');
    Route::get('/activity-logs', ActivityLogController::class)->middleware('permission:audit.view');

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'read']);
});
