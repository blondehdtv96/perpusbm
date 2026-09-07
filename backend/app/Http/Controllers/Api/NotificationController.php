<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json($request->user()->notifications()->latest()->paginate(20));
    }

    public function read(Request $request, string $notification): JsonResponse
    {
        $item = $request->user()->notifications()->findOrFail($notification);
        $item->markAsRead();

        return response()->json(['message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'Semua notifikasi ditandai sudah dibaca.']);
    }
}
