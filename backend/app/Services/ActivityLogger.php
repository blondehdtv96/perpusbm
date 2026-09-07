<?php

namespace App\Services;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class ActivityLogger
{
    public static function log(Request $request, string $action, ?Model $subject = null, array $changes = [], ?string $description = null): void
    {
        $safeChanges = collect($changes)->except(['password', 'member_qr_token', 'qr_token'])->all();

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'description' => $description,
            'changes' => $safeChanges ?: null,
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 500),
            'created_at' => now(),
        ]);
    }
}
