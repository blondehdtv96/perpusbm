<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClassGroup;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\MemberService;
use App\Services\QrCodeService;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
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
    public function __construct(private readonly MemberService $members) {}

    public function index(Request $request): JsonResponse
    {
        $users = User::query()->with(MemberService::RELATIONS)
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('nis_nip', 'like', "%{$search}%"));
            })
            ->when($request->string('member_type')->toString(), fn ($q, $type) => $q->where('member_type', $type))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            // Halaman Admin & Petugas menyaring beberapa role sekaligus, misalnya "super_admin,librarian".
            ->when($request->string('role')->toString(), function ($query, string $role): void {
                $names = array_values(array_filter(array_map('trim', explode(',', $role))));
                $query->whereHas('roles', fn ($q) => $q->whereIn('name', $names));
            })
            ->when($request->integer('class_group_id'), fn ($q, int $classGroupId) => $q->whereHas(
                'student.assignments',
                fn ($assignment) => $assignment->where('is_active', true)->where('class_group_id', $classGroupId),
            ))
            ->latest()->paginate(min($request->integer('per_page', 20), 100))
            ->through(fn (User $user) => $this->memberPayload($user));

        return response()->json($users);
    }

    /**
     * Pilihan isian form tambah anggota: tahun ajaran, tingkat, jurusan, dan kelas aktif.
     * Form memakai daftar kelas ini untuk menyaring pilihan secara bertingkat di sisi klien.
     */
    public function formOptions(): JsonResponse
    {
        return response()->json(['data' => $this->members->formOptions()]);
    }

    /**
     * Ringkasan jumlah anggota apa adanya dari basis data: dihitung ulang lewat satu
     * query agregat sehingga tidak terpengaruh filter maupun paginasi daftar anggota.
     */
    public function stats(): JsonResponse
    {
        $counts = User::query()
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN member_type = 'student' THEN 1 ELSE 0 END) as students")
            ->selectRaw("SUM(CASE WHEN member_type = 'staff' THEN 1 ELSE 0 END) as staff")
            ->selectRaw("SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active")
            ->selectRaw("SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended")
            ->selectRaw("SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive")
            ->first();

        return response()->json(['data' => [
            'total' => (int) $counts->total,
            'students' => (int) $counts->students,
            'staff' => (int) $counts->staff,
            'active' => (int) $counts->active,
            'suspended' => (int) $counts->suspended,
            'inactive' => (int) $counts->inactive,
            'archived' => User::onlyTrashed()->count(),
            'unplaced_students' => User::query()->where('member_type', 'student')
                ->whereDoesntHave('student.assignments', fn ($query) => $query->where('is_active', true))->count(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        [$data, $role, $classGroup, $joinedAt] = $this->splitPayload($data);
        $this->guardRoleAssignment($request, $role);
        $archived = $this->archivedMemberFor($data);
        $data = $this->attachPhoto($request, $data, $archived);

        $user = DB::transaction(function () use ($data, $role, $classGroup, $joinedAt, $archived): User {
            $user = $archived ?? new User;
            if ($archived) {
                $archived->restore();
            }
            $user->fill($data)->save();
            $user->syncRoles([$role]);
            $this->members->syncProfile($user, $classGroup, $joinedAt);

            return $user;
        });

        ActivityLogger::log($request, $archived ? 'user.restored' : 'user.created', $user, [
            ...$user->only('name', 'username', 'member_type', 'status'),
            'placement' => $classGroup?->display_name,
        ]);

        $payload = $this->memberPayload($user->fresh(MemberService::RELATIONS));

        return response()->json([
            'message' => ($archived
                ? 'Anggota ini pernah dihapus, datanya diaktifkan kembali dengan isian terbaru.'
                : 'Anggota berhasil ditambahkan.')
                .' Nomor anggota: '.($payload['member_number'] ?? '-').'.',
            'data' => $payload,
        ], 201);
    }

    public function show(User $user): JsonResponse
    {
        $user->load(MemberService::RELATIONS)->loadCount(['loans']);

        return response()->json(['data' => [...$this->memberPayload($user), 'loans_count' => $user->loans_count]]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, $user);
        [$data, $role, $classGroup, $joinedAt] = $this->splitPayload($data, $user);
        $this->guardRoleAssignment($request, $role, $user);
        if (empty($data['password'])) {
            unset($data['password']);
        }
        $this->guardArchivedConflicts($data, $user);
        $data = $this->attachPhoto($request, $data, $user);

        DB::transaction(function () use ($data, $role, $classGroup, $joinedAt, $user): void {
            $user->update($data);
            $user->syncRoles([$role]);
            $this->members->syncProfile($user, $classGroup, $joinedAt);
        });

        ActivityLogger::log($request, 'user.updated', $user, [
            ...$user->only('name', 'username', 'member_type', 'status'),
            'placement' => $classGroup?->display_name,
        ]);

        return response()->json(['data' => $this->memberPayload($user->fresh(MemberService::RELATIONS))]);
    }

    /**
     * Mengubah status anggota tanpa mengirim ulang seluruh isian form: daftar anggota hanya
     * perlu status barunya, sehingga penempatan kelas dan password tidak pernah ikut tersentuh.
     */
    public function updateStatus(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['active', 'suspended', 'inactive'])]]);
        abort_if($user->is($request->user()) && $data['status'] !== 'active', 422, 'Status akun sendiri tidak dapat diubah.');

        $user->update($data);
        $user->libraryMember()->first()?->update(['status' => $data['status']]);
        ActivityLogger::log($request, 'user.status_changed', $user, ['status' => $data['status']]);

        return response()->json(['data' => $this->memberPayload($user->fresh(MemberService::RELATIONS))]);
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
            ...$member->only('id', 'name', 'nis_nip', 'member_type', 'gender', 'class_or_position', 'photo_path', 'status'),
            'gender_label' => User::GENDERS[$member->gender] ?? null,
            'member_number' => $member->libraryMember?->member_number,
            'member_status' => $member->libraryMember?->status ?? $member->status,
            'joined_at' => $member->libraryMember?->joined_at?->toDateString(),
            'class_name' => $classGroup?->display_name ?? $member->class_or_position,
            'major' => $classGroup?->major?->name,
            'academic_year' => $assignment?->academicYear?->name,
            'qr_token' => $member->member_qr_token,
        ];
    }

    /**
     * Bentuk anggota yang dipakai daftar dan form: kolom users apa adanya ditambah
     * penempatan kelas terstruktur, supaya frontend tidak perlu membaca relasi bersarang.
     */
    private function memberPayload(User $user): array
    {
        $assignment = $user->student?->currentAssignment;
        $classGroup = $assignment?->classGroup;

        return [
            ...$user->only('id', 'name', 'username', 'nis_nip', 'member_type', 'gender', 'class_or_position', 'email', 'phone', 'photo_path', 'status', 'created_at', 'updated_at'),
            'gender_label' => User::GENDERS[$user->gender] ?? null,
            'roles' => $user->roles->map(fn ($role) => ['id' => $role->id, 'name' => $role->name])->all(),
            'role' => $user->roles->first()?->name ?? $user->member_type,
            'member_number' => $user->libraryMember?->member_number,
            'joined_at' => $user->libraryMember?->joined_at?->toDateString(),
            'placement' => $classGroup ? [
                'class_group_id' => $classGroup->id,
                'academic_year_id' => $assignment->academic_year_id,
                'education_level_id' => $classGroup->education_level_id,
                'major_id' => $classGroup->major_id,
                'class_name' => $classGroup->display_name,
                'level' => $classGroup->educationLevel?->name,
                'major_code' => $classGroup->major?->code,
                'major' => $classGroup->major?->name,
                'group_name' => $classGroup->group_name,
                'academic_year' => $assignment->academicYear?->name,
            ] : null,
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
     * Role pustakawan dan super admin hanya boleh diberikan oleh pemegang izin roles.manage,
     * yaitu Super Admin. Tanpa penjagaan ini, petugas dengan izin users.create dapat membuat
     * akun berhak akses penuh lewat form anggota dan menaikkan hak aksesnya sendiri.
     */
    private function guardRoleAssignment(Request $request, string $role, ?User $user = null): void
    {
        $privileged = ['super_admin', 'librarian'];
        $changing = in_array($role, $privileged, true)
            || ($user && $user->roles->pluck('name')->intersect($privileged)->isNotEmpty());

        abort_if(
            $changing && ! $request->user()->can('roles.manage'),
            403,
            'Hanya Super Admin yang dapat menambah atau mengubah akun admin dan pustakawan.',
        );
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
            'email' => $data['email'] ?? null,
        ];
        $labels = ['username' => 'Username', 'nis_nip' => 'NIS/NIP', 'email' => 'Email'];
        $errors = [];

        foreach ($candidates as $column => $value) {
            if ($value === null) {
                continue;
            }
            $conflict = User::onlyTrashed()->where($column, $value)
                ->when($allowed?->exists, fn ($query) => $query->whereKeyNot($allowed->getKey()))
                ->first();
            if ($conflict) {
                $label = $labels[$column];
                $errors[$column] = "{$label} {$value} masih tercatat pada anggota terhapus \"{$conflict->name}\". Gunakan {$label} lain atau tambahkan anggota tersebut kembali dengan NIS/NIP yang sama.";
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * Memisahkan isian form menjadi kolom users, role, kelas tujuan, dan tanggal gabung.
     * Label kelas/jabatan dihitung di sini supaya satu-satunya sumber kebenarannya adalah
     * master akademik, sedangkan foto diurus terpisah karena datang sebagai berkas unggahan.
     *
     * @return array{0: array<string, mixed>, 1: string, 2: ?ClassGroup, 3: ?string}
     */
    private function splitPayload(array $data, ?User $user = null): array
    {
        $role = $data['role'];
        $classGroup = $this->members->findActiveClassGroup($data['class_group_id'] ?? null);
        $position = $data['position'] ?? null;
        $joinedAt = isset($data['joined_at']) ? Carbon::parse($data['joined_at'])->toDateString() : null;
        unset($data['role'], $data['class_group_id'], $data['position'], $data['joined_at'], $data['photo'], $data['password_confirmation']);

        if ($data['member_type'] === 'student') {
            // Pada pembaruan tanpa pemindahan kelas, label kelas yang sudah tercatat dipertahankan.
            $label = $this->members->placementLabel($classGroup, null) ?? $user?->class_or_position;
        } else {
            $label = $this->members->placementLabel(null, $position);
        }

        $data['class_or_position'] = $label;

        return [$data, $role, $data['member_type'] === 'student' ? $classGroup : null, $joinedAt];
    }

    /**
     * Foto anggota dipakai kartu perpustakaan, jadi disimpan pada disk publik yang sama
     * dengan foto profil. Foto lama dihapus agar berkas yatim tidak menumpuk di storage.
     */
    private function attachPhoto(Request $request, array $data, ?User $user = null): array
    {
        if (! $request->hasFile('photo')) {
            return $data;
        }

        $data['photo_path'] = $request->file('photo')->store('profiles', 'public');
        if ($user?->photo_path && $user->photo_path !== $data['photo_path']) {
            Storage::disk('public')->delete($user->photo_path);
        }

        return $data;
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $this->normalize($request);

        // Kelas wajib saat menambah siswa baru; saat memperbarui, kelas hanya diisi bila
        // anggota memang sedang dipindahkan, atau bila penempatannya belum pernah ada.
        $classRequired = $user === null || ! $this->members->hasActivePlacement($user);
        $activeClasses = Rule::exists('class_groups', 'id')->where(fn ($query) => $query->where('is_active', true));

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)->withoutTrashed()],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:8', 'confirmed'],
            'nis_nip' => ['nullable', 'string', 'max:100', Rule::unique('users')->ignore($user)->withoutTrashed()],
            'member_type' => ['required', Rule::in(['student', 'staff'])],
            'gender' => ['nullable', Rule::in(array_keys(User::GENDERS))],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users')->ignore($user)->withoutTrashed()],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+\-\s()]+$/'],
            'photo' => ['nullable', 'image', 'max:2048'],
            'joined_at' => ['nullable', 'date', 'before_or_equal:today'],
            'class_group_id' => [
                'nullable',
                'integer',
                $classRequired ? 'required_if:member_type,student' : 'sometimes',
                $activeClasses,
            ],
            'position' => ['nullable', 'required_if:member_type,staff', 'string', 'max:255'],
            'status' => ['required', Rule::in(['active', 'suspended', 'inactive'])],
            'role' => ['required', Rule::in(['super_admin', 'librarian', 'staff', 'student'])],
        ], [
            'class_group_id.required_if' => 'Kelas wajib dipilih untuk anggota siswa. Pilih tingkat, jurusan, lalu kelasnya.',
            'class_group_id.exists' => 'Kelas yang dipilih tidak tersedia atau sedang nonaktif. Muat ulang pilihan kelas.',
            'position.required_if' => 'Jabatan wajib diisi untuk anggota guru atau staf.',
            'username.required' => 'Username wajib diisi. Bila NIS/NIP sudah diisi, nilainya otomatis dipakai sebagai username.',
            'password.confirmed' => 'Konfirmasi password belum sama dengan password awal.',
            'phone.regex' => 'Nomor HP hanya boleh berisi angka, spasi, tanda +, -, dan tanda kurung.',
            'joined_at.before_or_equal' => 'Tanggal gabung tidak boleh melewati hari ini.',
            'photo.image' => 'Foto anggota harus berupa gambar (JPG, PNG, atau WEBP).',
            'photo.max' => 'Ukuran foto anggota maksimal 2 MB.',
        ]);
    }

    /**
     * Membereskan isian sebelum divalidasi. NIS/NIP otomatis menjadi username seperti pada
     * registrasi siswa mandiri, sehingga petugas tidak perlu mengarang username terpisah.
     */
    private function normalize(Request $request): void
    {
        if ($request->has('nis_nip')) {
            $request->merge(['nis_nip' => User::normalizeNisNip($request->input('nis_nip'))]);
        }
        foreach (['username', 'email', 'phone'] as $field) {
            if (is_string($request->input($field))) {
                $request->merge([$field => trim($request->input($field))]);
            }
        }
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower($request->input('email'))]);
        }
        if (! $request->filled('username') && $request->filled('nis_nip')) {
            $request->merge(['username' => (string) $request->input('nis_nip')]);
        }
        foreach (['gender', 'email', 'phone', 'joined_at'] as $field) {
            if ($request->input($field) === '') {
                $request->merge([$field => null]);
            }
        }
    }
}
