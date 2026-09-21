<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AppSettingController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => AppSetting::current()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'app_name' => ['required', 'string', 'max:100'],
            'app_subtitle' => ['nullable', 'string', 'max:150'],
            'footer_text' => ['nullable', 'string', 'max:255'],
            'logo' => ['nullable', 'image', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ]);

        $setting = AppSetting::current();
        $oldLogoPath = $setting->logo_path;
        $newLogoPath = null;

        if ($request->hasFile('logo')) {
            $newLogoPath = $request->file('logo')->store('branding', 'public');
            $data['logo_path'] = $newLogoPath;
        } elseif ($request->boolean('remove_logo')) {
            $data['logo_path'] = null;
        }

        unset($data['logo'], $data['remove_logo']);

        $setting->update($data);

        if (($newLogoPath || $request->boolean('remove_logo')) && $oldLogoPath) {
            Storage::disk('public')->delete($oldLogoPath);
        }

        ActivityLogger::log($request, 'app_setting.updated', $setting, $data);

        return response()->json(['data' => $setting->fresh()]);
    }
}
