<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\QrCodeService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $users = User::query()->with('roles:id,name')
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('nis_nip', 'like', "%{$search}%"));
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
        $archived = $this->archivedMemberFor($data);
        $user = DB::transaction(function () use ($data, $role, $archived): User {
            $user = $archived ?? new User;
            if ($archived) {
                $archived->restore();
            }
            $user->fill($data)->save();
            $user->syncRoles([$role]);

            return $user;
        });
        ActivityLogger::log($request, $archived ? 'user.restored' : 'user.created', $user, $user->only('name', 'username', 'member_type', 'status'));

        return response()->json([
            'message' => $archived
                ? 'Anggota ini pernah dihapus, datanya diaktifkan kembali dengan isian terbaru.'
                : 'Anggota berhasil ditambahkan.',
            'data' => $user->load('roles:id,name'),
        ], 201);
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
        $this->guardArchivedConflicts($data, $user);
        $user->update($data);
        $user->syncRoles([$role]);
        ActivityLogger::log($request, 'user.updated', $user, $user->only('name', 'username', 'member_type', 'status'));

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

    public function bulkDestroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct', Rule::exists('users', 'id')->whereNull('deleted_at')],
        ]);

        $users = User::query()->whereIn('id', $data['ids'])->get();
        $deleted = [];
        $skipped = [];

        foreach ($users as $user) {
            if ($user->is($request->user())) {
                $skipped[] = ['id' => $user->id, 'name' => $user->name, 'reason' => 'Akun sendiri tidak dapat dihapus.'];

                continue;
            }
            if ($user->loans()->whereNotNull('active_copy_id')->exists()) {
                $skipped[] = ['id' => $user->id, 'name' => $user->name, 'reason' => 'Masih memiliki pinjaman aktif.'];

                continue;
            }

            $user->delete();
            ActivityLogger::log($request, 'user.deleted', $user);
            $deleted[] = ['id' => $user->id, 'name' => $user->name];
        }

        ActivityLogger::log($request, 'users.bulk_deleted', null, ['deleted' => count($deleted), 'skipped' => count($skipped)]);

        return response()->json(['data' => ['deleted' => $deleted, 'skipped' => $skipped]]);
    }

    public function profile(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->load('roles:id,name')]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'class_or_position' => ['nullable', 'string', 'max:255'],
            'photo' => ['nullable', 'image', 'max:2048'],
        ]);
        if ($request->user()->member_type === 'student' && $request->user()->student()->exists()) {
            unset($data['class_or_position']);
        }
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
        $member = ($user ?? $request->user())->load($this->cardRelations());

        return response()->json(['data' => $this->cardPayload($member)]);
    }

    public function printCards(Request $request, QrCodeService $qr): Response
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct', Rule::exists('users', 'id')->whereNull('deleted_at')],
        ]);
        $members = User::query()
            ->with($this->cardRelations())
            ->whereIn('id', $data['ids'])
            ->get()
            ->keyBy('id');
        $cards = collect($data['ids'])->map(function (int $id) use ($members, $qr): array {
            $member = $members->get($id);

            return [
                ...$this->cardPayload($member),
                'qr_image' => $qr->dataUri((string) $member->member_qr_token, 180),
                'photo_image' => $this->photoDataUri($member->photo_path),
            ];
        });
        ActivityLogger::log($request, 'users.cards_exported', null, ['count' => $cards->count()]);

        return Pdf::loadView('pdf.member-cards', compact('cards'))
            ->setPaper('a4', 'portrait')
            ->download('kartu-anggota-'.now()->format('Ymd-His').'.pdf');
    }

    public function rotateQr(Request $request, User $user): JsonResponse
    {
        $user->forceFill(['member_qr_token' => Str::random(64)])->save();
        ActivityLogger::log($request, 'user.qr_rotated', $user);

        return response()->json(['message' => 'QR anggota berhasil diperbarui.', 'data' => ['qr_token' => $user->member_qr_token]]);
    }

    private function cardRelations(): array
    {
        return [
            'libraryMember',
            'student.currentAssignment.academicYear',
            'student.currentAssignment.classGroup.educationLevel',
            'student.currentAssignment.classGroup.major',
        ];
    }

    private function cardPayload(User $member): array
    {
        $assignment = $member->student?->currentAssignment;
        $classGroup = $assignment?->classGroup;

        return [
            ...$member->only('id', 'name', 'nis_nip', 'member_type', 'class_or_position', 'photo_path', 'status'),
            'member_number' => $member->libraryMember?->member_number,
            'member_status' => $member->libraryMember?->status ?? $member->status,
            'class_name' => $classGroup?->display_name ?? $member->class_or_position,
            'major' => $classGroup?->major?->name,
            'academic_year' => $assignment?->academicYear?->name,
            'qr_token' => $member->member_qr_token,
        ];
    }

    private function photoDataUri(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        try {
            $disk = Storage::disk('public');
            if (! $disk->exists($path)) {
                return null;
            }
            $mime = $disk->mimeType($path);
            if (! is_string($mime) || ! str_starts_with($mime, 'image/')) {
                return null;
            }

            return "data:{$mime};base64,".base64_encode($disk->get($path));
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Anggota yang pernah dihapus dan boleh dipakai ulang oleh isian form ini:
     * dicocokkan lewat NIS/NIP, atau lewat username selama NIS/NIP-nya tidak bentrok.
     * Konsisten dengan perilaku import anggota yang memulihkan data lama.
     */
    private function archivedMemberFor(array $data): ?User
    {
        $nisNip = $data['nis_nip'] ?? null;
        $archived = $nisNip !== null ? User::onlyTrashed()->where('nis_nip', $nisNip)->first() : null;

        if (! $archived) {
            $byUsername = User::onlyTrashed()->where('username', $data['username'])->first();
            if ($byUsername && ($byUsername->nis_nip === null || $byUsername->nis_nip === $nisNip)) {
                $archived = $byUsername;
            }
        }

        $this->guardArchivedConflicts($data, $archived);

        return $archived;
    }

    /**
     * Username dan NIS/NIP tetap unik pada level basis data termasuk baris terhapus,
     * jadi bentrok dengan anggota di arsip dilaporkan dengan pesan yang jelas.
     */
    private function guardArchivedConflicts(array $data, ?User $allowed = null): void
    {
        $candidates = [
            'username' => $data['username'] ?? null,
            'nis_nip' => $data['nis_nip'] ?? null,
        ];
        $errors = [];

        foreach ($candidates as $column => $value) {
            if ($value === null) {
                continue;
            }
            $conflict = User::onlyTrashed()->where($column, $value)
                ->when($allowed?->exists, fn ($query) => $query->whereKeyNot($allowed->getKey()))
                ->first();
            if ($conflict) {
                $label = $column === 'username' ? 'Username' : 'NIS/NIP';
                $errors[$column] = "{$label} {$value} masih tercatat pada anggota terhapus \"{$conflict->name}\". Gunakan {$label} lain atau tambahkan anggota tersebut kembali dengan NIS/NIP yang sama.";
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function validated(Request $request, ?User $user = null): array
    {
        if ($request->has('nis_nip')) {
            $request->merge(['nis_nip' => User::normalizeNisNip($request->input('nis_nip'))]);
        }
        if (is_string($request->input('username'))) {
            $request->merge(['username' => trim($request->input('username'))]);
        }

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)->withoutTrashed()],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8'],
            'nis_nip' => ['nullable', 'string', 'max:100', Rule::unique('users')->ignore($user)->withoutTrashed()],
            'member_type' => ['required', Rule::in(['student', 'staff'])],
            'class_or_position' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::in(['active', 'suspended', 'inactive'])],
            'role' => ['required', Rule::in(['super_admin', 'librarian', 'staff', 'student'])],
        ]);
    }
}
