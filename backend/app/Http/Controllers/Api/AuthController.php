<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private const MAX_LOGIN_ATTEMPTS = 10;

    private const LOGIN_DECAY_SECONDS = 60;

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string', 'max:100'],
            'password' => ['required', 'string'],
        ]);
        $username = trim($credentials['username']);
        $limiterKey = $this->loginLimiterKey($username, $request->ip());

        if (RateLimiter::tooManyAttempts($limiterKey, self::MAX_LOGIN_ATTEMPTS)) {
            return $this->lockoutResponse($limiterKey);
        }

        if (! Auth::attempt([
            'username' => $username,
            'password' => $credentials['password'],
        ], $request->boolean('remember'))) {
            return $this->failedLogin($limiterKey);
        }

        if ($request->user()->status !== 'active') {
            Auth::logout();

            return $this->failedLogin($limiterKey);
        }

        RateLimiter::clear($limiterKey);
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

    private function loginLimiterKey(string $username, ?string $ip): string
    {
        return 'login:'.hash('sha256', Str::lower($username).'|'.($ip ?? 'unknown'));
    }

    private function failedLogin(string $limiterKey): JsonResponse
    {
        RateLimiter::hit($limiterKey, self::LOGIN_DECAY_SECONDS);

        if (RateLimiter::tooManyAttempts($limiterKey, self::MAX_LOGIN_ATTEMPTS)) {
            return $this->lockoutResponse($limiterKey);
        }

        throw ValidationException::withMessages([
            'username' => ['Username atau kata sandi tidak valid.'],
        ]);
    }

    private function lockoutResponse(string $limiterKey): JsonResponse
    {
        $retryAfter = max(1, RateLimiter::availableIn($limiterKey));

        return response()->json([
            'message' => 'Percobaan masuk terlalu sering. Silakan tunggu sebelum mencoba kembali.',
            'retry_after' => $retryAfter,
        ], 429, [
            'Retry-After' => (string) $retryAfter,
            'Cache-Control' => 'no-store',
        ]);
    }

    private function userPayload(Request $request): array
    {
        $user = $request->user();

        return ['user' => $user, 'roles' => $user->getRoleNames(), 'permissions' => $user->getAllPermissions()->pluck('name')];
    }
}
