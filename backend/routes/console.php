<?php

use App\Models\CirculationRequest;
use App\Models\Loan;
use App\Notifications\DueSoonNotification;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function (): void {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(function (): void {
    Loan::whereNotNull('active_copy_id')->where('status', 'active')->where('due_at', '<', now())
        ->update(['status' => 'overdue']);

    Loan::with(['user', 'bookCopy.book'])
        ->whereNotNull('active_copy_id')
        ->whereNull('due_reminded_at')
        ->whereDate('due_at', now()->addDay()->toDateString())
        ->chunkById(100, function ($loans): void {
            foreach ($loans as $loan) {
                $loan->user->notify(new DueSoonNotification($loan));
                $loan->update(['due_reminded_at' => now()]);
            }
        });

    CirculationRequest::where('expires_at', '<', now())->delete();
})->dailyAt('08:00')->name('library-daily-maintenance')->withoutOverlapping();
