<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $users = User::query()->with('roles:id,name')
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")->orWhere('nis_nip', 'like', "%{$search}%"));
            })
            ->when($request->string('member_type')->toString(), fn ($q, $type) => $q->where('member_type', $type))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->latest()->paginate(min($request->integer('per_page', 20), 100));

        return response()->json($users);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $role = $data['role'];
        unset($data['role']);
        $user = DB::transaction(function () use ($data, $role): User {
            $user = User::create($data);
            $user->assignRole($role);

            return $user;
        });
        ActivityLogger::log($request, 'user.created', $user, $user->only('name', 'username', 'email', 'member_type', 'status'));

        return response()->json(['data' => $user->load('roles:id,name')], 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['data' => $user->load('roles:id,name')->loadCount(['loans'])]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, $user);
        $role = $data['role'];
        unset($data['role']);
        if (empty($data['password'])) {
            unset($data['password']);
        }
        $user->update($data);
        $user->syncRoles([$role]);
        ActivityLogger::log($request, 'user.updated', $user, $user->only('name', 'username', 'email', 'member_type', 'status'));

        return response()->json(['data' => $user->fresh()->load('roles:id,name')]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if($user->is($request->user()), 422, 'Akun sendiri tidak dapat dihapus.');
        abort_if($user->loans()->whereNotNull('active_copy_id')->exists(), 422, 'Pengguna masih memiliki pinjaman aktif.');
        $user->delete();
        ActivityLogger::log($request, 'user.deleted', $user);

        return response()->json(status: 204);
    }

    public function profile(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->load('roles:id,name')]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'class_or_position' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ]);
        if ($request->hasFile('photo')) {
            $data['photo_path'] = $request->file('photo')->store('profiles', 'public');
        }
        unset($data['photo']);
        $request->user()->update($data);
        ActivityLogger::log($request, 'profile.updated', $request->user(), $data);

        return response()->json(['data' => $request->user()->fresh()]);
    }

    public function card(Request $request, ?User $user = null): JsonResponse
    {
        $member = $user ?? $request->user();

        return response()->json(['data' => [...$member->only('id', 'name', 'nis_nip', 'member_type', 'class_or_position', 'photo_path'), 'qr_token' => $member->member_qr_token]]);
    }

    public function rotateQr(Request $request, User $user): JsonResponse
    {
        $user->forceFill(['member_qr_token' => Str::random(64)])->save();
        ActivityLogger::log($request, 'user.qr_rotated', $user);

        return response()->json(['message' => 'QR anggota berhasil diperbarui.', 'data' => ['qr_token' => $user->member_qr_token]]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
            'nis_nip' => ['nullable', 'string', 'max:100', Rule::unique('users')->ignore($user)],
            'member_type' => ['required', Rule::in(['student', 'staff'])],
            'phone' => ['nullable', 'string', 'max:30'],
            'class_or_position' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::in(['active', 'suspended', 'inactive'])],
            'role' => ['required', Rule::in(['super_admin', 'librarian', 'staff', 'student'])],
        ]);
    }
}
