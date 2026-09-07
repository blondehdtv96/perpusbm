<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages(['username' => ['Username atau kata sandi tidak valid.']]);
        }

        if ($request->user()->status !== 'active') {
            Auth::logout();
            throw ValidationException::withMessages(['username' => ['Akun tidak aktif.']]);
        }

        $request->session()->regenerate();

        return response()->json(['data' => $this->userPayload($request)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->userPayload($request)]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Berhasil keluar.']);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);
        $status = Password::sendResetLink($request->only('email'));
        if ($status !== Password::RESET_LINK_SENT) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        return response()->json(['message' => __($status)]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required'], 'email' => ['required', 'email'], 'password' => ['required', 'confirmed', 'min:8']]);
        $status = Password::reset($data, function ($user, $password): void {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
        });
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        return response()->json(['message' => __($status)]);
    }

    private function userPayload(Request $request): array
    {
        $user = $request->user();

        return ['user' => $user, 'roles' => $user->getRoleNames(), 'permissions' => $user->getAllPermissions()->pluck('name')];
    }
}
