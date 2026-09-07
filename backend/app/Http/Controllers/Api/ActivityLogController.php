<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $logs = ActivityLog::with('user:id,name')
            ->when($request->string('action')->toString(), fn ($q, $action) => $q->where('action', 'like', "{$action}%"))
            ->when($request->integer('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->latest('created_at')->paginate(min($request->integer('per_page', 30), 100));

        return response()->json($logs);
    }
}
