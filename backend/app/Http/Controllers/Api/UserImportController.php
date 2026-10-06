<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClassGroup;
use App\Models\EducationLevel;
use App\Models\ImportFailure;
use App\Models\ImportJob;
use App\Models\Major;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\MemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class UserImportController extends Controller
{
    /** Template berjalan: penempatan siswa ditulis bebas pada satu kolom kelas, misalnya "10 TKJ A". */
    private const HEADERS = ['name', 'username', 'nis_nip', 'member_type', 'kelas', 'jabatan', 'password'];

    /** Template dengan kolom penempatan terpisah tetap diterima dan dibaca sebagai satu tulisan kelas. */
    private const SPLIT_HEADERS = ['name', 'username', 'nis_nip', 'member_type', 'tingkat', 'jurusan', 'kelas', 'jabatan', 'password'];

    /** Template paling lama tetap diterima supaya berkas yang sudah disiapkan petugas tidak terbuang. */
    private const LEGACY_HEADERS = ['name', 'username', 'nis_nip', 'member_type', 'class_or_position', 'password'];

    public function __construct(private readonly MemberService $members) {}

    public function store(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt,xlsx,xls', 'max:5120']]);
        $file = $request->file('file');
        $job = ImportJob::create(['user_id' => $request->user()->id, 'filename' => $file->getClientOriginalName()]);
        $spreadsheet = null;

        try {
            $spreadsheet = IOFactory::load($file->getRealPath());
            $sheet = $spreadsheet->getSheetByName('Data Anggota') ?? $spreadsheet->getActiveSheet();
            $rows = $sheet->toArray(null, true, true, false);
            $headers = array_map(
                fn ($value) => str((string) $value)->replace("\xEF\xBB\xBF", '')->trim()->lower()->replace(' ', '_')->toString(),
                array_shift($rows) ?? [],
            );
            $layout = $this->headerLayout($headers);

            $created = 0;
            $updated = 0;
            $failed = 0;
            $processed = 0;
            $notes = [];
            $newMasters = ['levels' => [], 'majors' => [], 'classes' => []];
            $masters = $this->masters();

            if ($layout === 'split') {
                $notes[] = ['row_number' => 1, 'username' => null, 'message' => 'Berkas memakai template dengan kolom tingkat, jurusan, dan kelas terpisah. Ketiganya tetap dibaca, tetapi template terbaru cukup satu kolom kelas, misalnya 10 TKJ A.'];
            }
            if ($layout === 'legacy') {
                $notes[] = ['row_number' => 1, 'username' => null, 'message' => 'Berkas memakai template lama, jadi kolom kelas/jabatan disimpan sebagai teks biasa tanpa penempatan kelas. Unduh template terbaru untuk menempatkan siswa lewat kolom kelas.'];
            }

            foreach ($rows as $offset => $values) {
                if (! array_filter($values, fn ($value) => $value !== null && $value !== '')) {
                    continue;
                }

                $processed++;
                $rowNumber = $offset + 2;
                $row = array_combine($headers, array_slice(array_pad($values, count($headers), null), 0, count($headers)));
                $row = array_map(fn ($value) => $value === null || $value === '' ? null : trim((string) $value), $row);
                $row['nis_nip'] = User::normalizeNisNip($row['nis_nip'] ?? null);
                $validator = Validator::make($row, $this->rules($layout), $this->messages());

                if ($validator->fails()) {
                    $this->recordFailure($job, $rowNumber, $row, $validator->errors()->toArray());
                    $failed++;

                    continue;
                }

                $data = $validator->validated();
                $password = $data['password'];
                unset($data['password']);

                $placement = $layout === 'legacy'
                    ? ['class_group' => null, 'errors' => [], 'notes' => [], 'created' => [], 'label' => $data['class_or_position'] ?? null]
                    : $this->resolvePlacement($data, $layout, $masters);

                if ($placement['errors']) {
                    $this->recordFailure($job, $rowNumber, $row, $placement['errors']);
                    $failed++;

                    continue;
                }

                foreach (['level' => 'levels', 'major' => 'majors', 'class' => 'classes'] as $key => $bucket) {
                    if (isset($placement['created'][$key])) {
                        $newMasters[$bucket][] = $placement['created'][$key];
                    }
                }

                try {
                    $result = $this->saveMember([
                        'name' => $data['name'],
                        'username' => $data['username'],
                        'nis_nip' => $data['nis_nip'] ?? null,
                        'member_type' => $data['member_type'],
                        'class_or_position' => $placement['label'],
                    ], $password, $placement['class_group']);
                } catch (Throwable $exception) {
                    report($exception);
                    $this->recordFailure($job, $rowNumber, $row, [
                        'row' => ['Baris tidak dapat disimpan karena kendala teknis. Silakan ulangi import untuk baris ini.'],
                    ]);
                    $failed++;

                    continue;
                }

                foreach ([...$placement['notes'], ...$result['notes']] as $note) {
                    $notes[] = ['row_number' => $rowNumber, 'username' => $result['user']->username, 'message' => $note];
                }
                $result['created'] ? $created++ : $updated++;
            }

            $job->update([
                'status' => 'completed',
                'total_rows' => $processed,
                'success_rows' => $created,
                'updated_rows' => $updated,
                'failed_rows' => $failed,
                'notes' => $notes,
            ]);
            $newMasters = array_filter(array_map(fn (array $names) => array_values(array_unique($names)), $newMasters));
            if ($newMasters) {
                ActivityLogger::log($request, 'academic.classes.created_by_import', $job, $newMasters);
            }
            ActivityLogger::log($request, 'users.imported', $job, ['created' => $created, 'updated' => $updated, 'failed' => $failed]);

            return response()->json(['data' => $job->fresh('failures')], 201);
        } catch (Throwable $exception) {
            $job->update(['status' => 'failed']);
            throw $exception;
        } finally {
            $spreadsheet?->disconnectWorksheets();
        }
    }

    /**
     * Menentukan tata letak berkas. Selain template berjalan, dua susunan lama tetap dikenali
     * supaya berkas yang sudah disiapkan petugas tidak perlu dibuat ulang.
     */
    private function headerLayout(array $headers): string
    {
        return match (true) {
            $headers === self::HEADERS => 'single',
            $headers === self::SPLIT_HEADERS => 'split',
            $headers === self::LEGACY_HEADERS => 'legacy',
            default => throw ValidationException::withMessages([
                'file' => [
                    'Header template tidak valid. Unduh template terbaru dan jangan mengubah nama atau urutan kolom. '
                    .'Header wajib: '.implode(', ', self::HEADERS).'. '
                    .'Dua template lama juga masih diterima: '.implode(', ', self::SPLIT_HEADERS).'; '
                    .'serta '.implode(', ', self::LEGACY_HEADERS).'.',
                ],
            ]),
        };
    }

    private function rules(string $layout): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/'],
            'nis_nip' => ['nullable', 'string', 'max:100'],
            'member_type' => ['required', 'in:student,staff'],
            'password' => ['required', 'string', 'min:8'],
        ];

        return match ($layout) {
            'legacy' => [...$rules, 'class_or_position' => ['nullable', 'string', 'max:255']],
            'split' => [...$rules,
                'tingkat' => ['nullable', 'string', 'max:30'],
                'jurusan' => ['nullable', 'string', 'max:150'],
                'kelas' => ['nullable', 'string', 'max:30'],
                'jabatan' => ['nullable', 'string', 'max:255'],
            ],
            default => [...$rules,
                'kelas' => ['nullable', 'string', 'max:180'],
                'jabatan' => ['nullable', 'string', 'max:255'],
            ],
        };
    }

    private function messages(): array
    {
        return [
            'member_type.in' => 'Tipe anggota harus student atau staff.',
            'password.required' => 'Password awal wajib diisi.',
            'password.min' => 'Password awal minimal 8 karakter.',
            'tingkat.max' => 'Tingkat maksimal :max karakter, contoh: 10.',
            'jurusan.max' => 'Jurusan maksimal :max karakter. Isi dengan kode jurusan, contoh: TKJ.',
            'kelas.max' => 'Kolom kelas maksimal :max karakter. Tulis tingkat, jurusan, lalu rombel saja, contoh: 10 TKJ A.',
        ];
    }

    /** @return array{levels: Collection, majors: Collection, groups: array<int, string>} */
    private function masters(): array
    {
        return [
            'levels' => EducationLevel::query()->where('is_active', true)->get(),
            'majors' => Major::query()->where('is_active', true)->get(),
            'groups' => ClassGroup::query()->orderBy('group_name')->pluck('group_name')
                ->map(fn (string $name) => mb_strtoupper($name))->unique()->values()->all(),
        ];
    }

    /**
     * Menentukan penempatan satu baris. Siswa cukup ditulis pada satu kolom kelas apa adanya,
     * sedangkan berkas dengan kolom terpisah digabungkan dulu menjadi satu tulisan kelas.
     *
     * @return array{class_group: ?ClassGroup, errors: array<string, array<int, string>>, notes: array<int, string>, created: array<string, string>, label: ?string}
     */
    private function resolvePlacement(array $data, string $layout, array &$masters): array
    {
        $result = ['class_group' => null, 'errors' => [], 'notes' => [], 'created' => [], 'label' => null];
        $position = $data['jabatan'] ?? null;
        $text = $layout === 'split' ? $this->joinPlacementColumns($data) : ($data['kelas'] ?? null);

        if ($data['member_type'] !== 'student') {
            $result['label'] = $position;
            if ($text !== null) {
                $result['notes'][] = 'Anggota bertipe staff, jadi kolom kelas diabaikan dan hanya jabatan yang disimpan.';
            }
            if ($position === null) {
                $result['notes'][] = 'Kolom jabatan kosong, jabatan anggota dapat dilengkapi lewat halaman Anggota.';
            }

            return $result;
        }

        if ($position !== null) {
            $result['notes'][] = 'Anggota bertipe student, jadi kolom jabatan diabaikan dan kelas dipakai sebagai keterangan.';
        }

        if ($text === null) {
            $result['notes'][] = 'Kolom kelas belum diisi, jadi siswa ini tersimpan tanpa penempatan kelas. Lengkapi lewat halaman Anggota.';

            return $result;
        }

        $parsed = $this->parseClassText($text, $masters['groups']);

        if ($parsed['level'] === null || $parsed['major'] === null) {
            $result['errors']['kelas'] = ["Kelas \"{$text}\" belum bisa dibaca. Tulis tingkat, jurusan, lalu rombel dalam satu kolom, contoh: 10 TKJ A."];

            return $result;
        }

        $resolved = $this->resolveClassGroup($parsed, $text, $masters);

        return [...$resolved, 'notes' => [...$result['notes'], ...$resolved['notes']]];
    }

    /** Template dengan kolom terpisah dibaca ulang sebagai satu tulisan kelas: "10" + "TKJ" + "A". */
    private function joinPlacementColumns(array $data): ?string
    {
        $parts = array_filter(
            [$data['tingkat'] ?? null, $data['jurusan'] ?? null, $data['kelas'] ?? null],
            fn (?string $value) => $value !== null && trim($value) !== '',
        );

        return $parts ? implode(' ', $parts) : null;
    }

    /**
     * Membaca kolom kelas yang ditulis bebas menjadi tingkat, jurusan, dan rombel. Pemisah selain
     * spasi (misalnya "X-TKJ-1") diseragamkan dulu, kata "kelas"/"tingkat" di depan dibuang, dan
     * kata terakhir dianggap rombel bila pendek atau sudah dikenal sebagai rombel pada master.
     *
     * @param  array<int, string>  $knownGroups
     * @return array{level: ?string, major: ?string, group: ?string}
     */
    private function parseClassText(string $text, array $knownGroups): array
    {
        $clean = (string) preg_replace('/\s+/u', ' ', (string) preg_replace('~[/\\\\\-_.,;|]+~u', ' ', trim($text)));
        $clean = trim((string) preg_replace('/^(kelas|tingkat)\s+/iu', '', $clean));
        $tokens = $clean === '' ? [] : explode(' ', $clean);

        if (count($tokens) < 2) {
            return ['level' => null, 'major' => null, 'group' => null];
        }

        $level = array_shift($tokens);
        $group = null;
        $last = (string) end($tokens);

        if (count($tokens) >= 2 && (in_array(mb_strtoupper($last), $knownGroups, true) || preg_match('/^[\p{L}\p{N}]{1,3}$/u', $last))) {
            $group = array_pop($tokens);
        }

        return ['level' => $level, 'major' => implode(' ', $tokens), 'group' => $group];
    }

    /**
     * Mengubah hasil pembacaan menjadi satu kelas pada master akademik. Tingkat, jurusan, dan
     * rombel yang belum terdaftar dibuatkan otomatis lalu dicatat, sehingga petugas tidak perlu
     * menyiapkan struktur akademik lebih dulu hanya untuk bisa mengimpor datanya.
     *
     * @param  array{level: string, major: string, group: ?string}  $parsed
     * @return array{class_group: ?ClassGroup, errors: array<string, array<int, string>>, notes: array<int, string>, created: array<string, string>, label: ?string}
     */
    private function resolveClassGroup(array $parsed, string $text, array &$masters): array
    {
        $result = ['class_group' => null, 'errors' => [], 'notes' => [], 'created' => [], 'label' => null];
        $year = $this->members->activeAcademicYear();

        if (! $year) {
            $result['errors']['kelas'] = ['Tahun ajaran aktif belum tersedia. Tambahkan tahun ajaran di menu Struktur akademik sebelum menempatkan siswa.'];

            return $result;
        }

        $level = $this->members->matchLevel($parsed['level'], $masters['levels']);
        if (! $level) {
            $level = $this->createLevel($parsed['level']);
            $masters['levels']->push($level);
            if ($level->wasRecentlyCreated) {
                $result['created']['level'] = $level->name;
                $result['notes'][] = "Tingkat {$level->name} belum ada pada master akademik dan dibuatkan otomatis.";
            } else {
                $result['notes'][] = "Tingkat {$level->name} sedang nonaktif pada master akademik dan diaktifkan kembali.";
            }
        }

        $major = $this->members->matchMajor($parsed['major'], $masters['majors']);
        if (! $major) {
            $major = $this->createMajor($parsed['major']);
            $masters['majors']->push($major);
            if ($major->wasRecentlyCreated) {
                $result['created']['major'] = $major->code;
                $result['notes'][] = "Jurusan {$major->code} belum ada pada master akademik dan dibuatkan otomatis. Lengkapi nama lengkapnya di menu Struktur akademik.";
            } else {
                $result['notes'][] = "Jurusan \"{$parsed['major']}\" dicocokkan dengan jurusan {$major->code} ({$major->name}) yang sudah ada pada master akademik.";
            }
        }

        $keys = ['academic_year_id' => $year->id, 'education_level_id' => $level->id, 'major_id' => $major->id];
        $group = $parsed['group'] !== null ? mb_strtoupper(trim($parsed['group'])) : null;

        if ($group === null) {
            $candidates = ClassGroup::query()->where($keys)->where('is_active', true)->orderBy('group_name')->get();

            if ($candidates->count() !== 1) {
                $result['errors']['kelas'] = ["Kelas \"{$text}\" belum menyebut rombel. Tulis rombelnya di belakang, contoh: {$level->name} {$major->code} A."];

                return $result;
            }

            $group = $candidates->first()->group_name;
            $result['notes'][] = "Kelas \"{$text}\" tidak menyebut rombel, dan karena tingkat serta jurusan tersebut hanya punya satu rombel, siswa ditempatkan pada rombel {$group}.";
        }

        $keys['group_name'] = mb_substr($group, 0, 30);
        $classGroup = ClassGroup::query()->where($keys)->with(['academicYear', 'educationLevel', 'major'])->first();

        if (! $classGroup) {
            $classGroup = ClassGroup::create([...$keys, 'is_active' => true])->load(['academicYear', 'educationLevel', 'major']);
            $result['created']['class'] = $classGroup->display_name;
            $result['notes'][] = "Kelas {$classGroup->display_name} belum ada pada master akademik tahun {$year->name} dan dibuatkan otomatis.";
        } elseif (! $classGroup->is_active) {
            $classGroup->update(['is_active' => true]);
            $result['notes'][] = "Kelas {$classGroup->display_name} sedang nonaktif pada master akademik dan diaktifkan kembali agar siswa ini bisa ditempatkan.";
        }

        if (! in_array($keys['group_name'], $masters['groups'], true)) {
            $masters['groups'][] = $keys['group_name'];
        }

        $result['class_group'] = $classGroup;
        $result['label'] = $classGroup->display_name;

        return $result;
    }

    /** Tingkat baru memakai angka bila ditulis dengan angka Romawi supaya master tetap seragam. */
    private function createLevel(string $value): EducationLevel
    {
        $name = mb_substr($this->members->canonicalLevelName($value), 0, 30);
        $existing = EducationLevel::query()->where('name', $name)->first();

        if ($existing) {
            if (! $existing->is_active) {
                $existing->update(['is_active' => true]);
            }

            return $existing;
        }

        return EducationLevel::create([
            'name' => $name,
            'sort_order' => is_numeric($name) ? min(255, max(0, (int) $name)) : 0,
            'is_active' => true,
        ]);
    }

    /** Jurusan baru memakai tulisan petugas sebagai kode, atau singkatannya bila yang ditulis nama panjang. */
    private function createMajor(string $value): Major
    {
        $value = trim($value);
        $code = mb_strlen($value) <= 20 ? mb_strtoupper($value) : $this->majorCode($value);
        $existing = Major::query()->where('code', $code)->first();

        if ($existing) {
            if (! $existing->is_active) {
                $existing->update(['is_active' => true]);
            }

            return $existing;
        }

        return Major::create(['code' => $code, 'name' => mb_substr($value, 0, 150), 'is_active' => true]);
    }

    /** Nama jurusan yang terlalu panjang untuk kolom kode diringkas menjadi singkatan huruf depannya. */
    private function majorCode(string $value): string
    {
        $initials = collect(preg_split('/\s+/u', $value) ?: [])
            ->reject(fn (string $word) => in_array(mb_strtolower($word), ['dan', 'atau', 'the', 'of'], true))
            ->map(fn (string $word) => mb_strtoupper(mb_substr($word, 0, 1)))
            ->implode('');

        return mb_substr($initials !== '' ? $initials : mb_strtoupper($value), 0, 20);
    }

    /**
     * Simpan satu baris anggota tanpa pernah menggagalkan baris karena bentrok unik:
     * anggota lama dipakai ulang (termasuk yang pernah dihapus) dan username bentrok diberi akhiran.
     *
     * @return array{user: User, created: bool, notes: array<int, string>}
     */
    private function saveMember(array $data, string $password, ?ClassGroup $classGroup): array
    {
        return DB::transaction(function () use ($data, $password, $classGroup): array {
            $notes = [];
            $nisNip = $data['nis_nip'] ?? null;
            $existing = $nisNip !== null ? User::withTrashed()->where('nis_nip', $nisNip)->first() : null;

            if (! $existing) {
                $byUsername = User::withTrashed()->where('username', $data['username'])->first();
                if ($byUsername && $nisNip !== null && $byUsername->nis_nip !== null && $byUsername->nis_nip !== $nisNip) {
                    $notes[] = "Username {$data['username']} sudah dipakai anggota dengan NIS/NIP {$byUsername->nis_nip}, sehingga baris ini disimpan sebagai anggota baru.";
                    $byUsername = null;
                }
                $existing = $byUsername;
            }

            if ($existing && $existing->hasAnyRole(['super_admin', 'librarian'])) {
                $notes[] = "Data baris ini cocok dengan akun petugas {$existing->username}; akun tersebut tidak diubah dan anggota disimpan terpisah.";
                $existing = null;
            }

            $user = $existing ?? new User;
            $created = $existing === null;
            $attributes = ['name' => $data['name'], 'member_type' => $data['member_type']];

            if ($created) {
                $attributes['username'] = $this->availableUsername($data['username']);
                $attributes['password'] = Hash::make($password);
                $attributes['status'] = 'active';
                if ($attributes['username'] !== $data['username']) {
                    $notes[] = "Username {$data['username']} sudah dipakai, anggota ini disimpan dengan username {$attributes['username']}.";
                }
            } elseif ($data['username'] !== $user->username) {
                if ($this->isTaken('username', $data['username'], $user->getKey())) {
                    $notes[] = "Username {$data['username']} sudah dipakai akun lain, username {$user->username} dipertahankan.";
                } else {
                    $attributes['username'] = $data['username'];
                }
            }

            if ($nisNip !== null) {
                if ($this->isTaken('nis_nip', $nisNip, $user->getKey())) {
                    $notes[] = "NIS/NIP {$nisNip} sudah dipakai anggota lain sehingga tidak disimpan pada baris ini.";
                } else {
                    $attributes['nis_nip'] = $nisNip;
                }
            }

            if ($data['class_or_position'] !== null) {
                $attributes['class_or_position'] = $data['class_or_position'];
            }

            if (! $created && $user->trashed()) {
                $user->restore();
                $attributes['status'] = 'active';
                $notes[] = 'Anggota ini pernah dihapus dan kini diaktifkan kembali dengan data terbaru.';
            } elseif (! $created) {
                $notes[] = 'Anggota sudah terdaftar, datanya diperbarui dan password lama tetap dipakai.';
            }

            $user->fill($attributes)->save();

            if ($created || $user->roles->isEmpty() || $user->roles->pluck('name')->diff(['student', 'staff'])->isEmpty()) {
                $user->syncRoles([$data['member_type']]);
            }

            // Nomor anggota dan penempatan kelas dibuat lewat jalur yang sama dengan form tambah
            // anggota, jadi data hasil import tidak pernah berbeda bentuk dari data entri manual.
            $this->members->syncProfile($user, $classGroup);

            return ['user' => $user, 'created' => $created, 'notes' => $notes];
        });
    }

    private function availableUsername(string $username): string
    {
        if (! $this->isTaken('username', $username)) {
            return $username;
        }

        for ($suffix = 2; $suffix <= 999; $suffix++) {
            $candidate = substr($username, 0, 100 - strlen((string) $suffix)).$suffix;
            if (! $this->isTaken('username', $candidate)) {
                return $candidate;
            }
        }

        return substr($username, 0, 92).strtolower(Str::random(8));
    }

    private function isTaken(string $column, string $value, ?int $ignoreId = null): bool
    {
        return User::withTrashed()->where($column, $value)
            ->when($ignoreId !== null, fn ($query) => $query->whereKeyNot($ignoreId))
            ->exists();
    }

    private function recordFailure(ImportJob $job, int $rowNumber, array $row, array $errors): void
    {
        $row['password'] = '[DISEMBUNYIKAN]';
        ImportFailure::create([
            'import_job_id' => $job->id,
            'row_number' => $rowNumber,
            'row_data' => $row,
            'errors' => $errors,
        ]);
    }

    public function template(): StreamedResponse
    {
        $levels = EducationLevel::query()->where('is_active', true)->orderBy('sort_order')->orderBy('name')->pluck('name')->all();
        $majors = Major::query()->where('is_active', true)->orderBy('code')->get(['code', 'name']);
        $classes = $this->members->activeClassGroups()
            ->with(['educationLevel:id,name', 'major:id,code,name'])
            ->orderBy('education_level_id')->orderBy('major_id')->orderBy('group_name')
            ->get()
            ->map(fn (ClassGroup $group) => $group->display_name)
            ->values();

        return response()->streamDownload(function () use ($levels, $majors, $classes): void {
            $spreadsheet = new Spreadsheet;
            $this->buildDataSheet($spreadsheet->getActiveSheet());
            $this->buildMasterSheet($spreadsheet->createSheet(), $classes, $levels, $majors);
            $this->buildGuideSheet($spreadsheet->createSheet());
            $this->buildExampleSheet($spreadsheet->createSheet(), $classes, $levels, $majors);
            $spreadsheet->setActiveSheetIndex(0);
            (new Xlsx($spreadsheet))->save('php://output');
            $spreadsheet->disconnectWorksheets();
        }, 'template-import-anggota.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function buildDataSheet(Worksheet $sheet): void
    {
        $lastRow = 1000;
        $sheet->setTitle('Data Anggota');
        $sheet->fromArray(self::HEADERS, null, 'A1');
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:G{$lastRow}");
        $sheet->getStyle('A1:G1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1D4ED8']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        // Kolom penempatan diberi warna berbeda agar petugas langsung melihat mana milik siswa dan mana milik staf.
        $sheet->getStyle('E1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('0F766E');
        $sheet->getStyle('F1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('B45309');
        $sheet->getStyle("A1:G{$lastRow}")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        foreach (['B', 'C', 'E', 'G'] as $column) {
            $sheet->getStyle("{$column}2:{$column}{$lastRow}")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        }
        foreach (['A' => 26, 'B' => 20, 'C' => 18, 'D' => 14, 'E' => 24, 'F' => 24, 'G' => 20] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $type = new DataValidation;
        $type->setType(DataValidation::TYPE_LIST)
            ->setErrorStyle(DataValidation::STYLE_STOP)
            ->setAllowBlank(false)
            ->setShowDropDown(true)
            ->setShowErrorMessage(true)
            ->setErrorTitle('Tipe tidak valid')
            ->setError('Pilih student atau staff dari daftar.')
            ->setFormula1('"student,staff"');
        $sheet->setDataValidation("D2:D{$lastRow}", $type);

        // Kolom kelas sengaja tanpa daftar pilihan supaya petugas bisa mengetik langsung dan
        // menyalin-tempel satu kolom sekaligus. Yang tersisa hanya pesan bantuan saat sel dipilih;
        // isinya baru diperiksa saat import, termasuk kelas yang belum ada di master akademik.
        $kelas = new DataValidation;
        $kelas->setType(DataValidation::TYPE_NONE)
            ->setAllowBlank(true)
            ->setShowDropDown(false)
            ->setShowErrorMessage(false)
            ->setShowInputMessage(true)
            ->setPromptTitle('Kelas siswa')
            ->setPrompt('Ketik bebas, contoh: 10 TKJ A. Daftar kelas aktif ada di sheet Master sebagai referensi. Kosongkan untuk staf.');
        $sheet->setDataValidation("E2:E{$lastRow}", $kelas);
    }

    private function buildMasterSheet(Worksheet $sheet, Collection $classes, array $levels, Collection $majors): void
    {
        $sheet->setTitle('Master');
        $sheet->fromArray(['kelas aktif (referensi, boleh ditulis sendiri)', 'tingkat', 'kode jurusan', 'nama jurusan'], null, 'A1');
        $sheet->fromArray($classes->map(fn (string $name) => [$name])->all(), null, 'A2');
        $sheet->fromArray(array_map(fn (string $level) => [$level], $levels), null, 'B2');
        $sheet->fromArray($majors->map(fn ($major) => [$major->code, $major->name])->all(), null, 'C2');
        $sheet->getStyle('A1:D1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
        ]);
        $sheet->getStyle('A2:B200')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        foreach (['A' => 34, 'B' => 12, 'C' => 16, 'D' => 42] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
        $sheet->freezePane('A2');
    }

    private function buildGuideSheet(Worksheet $sheet): void
    {
        $sheet->setTitle('Petunjuk');
        $sheet->fromArray([
            ['PANDUAN IMPORT ANGGOTA BM LIBRARY', ''],
            ['Langkah', 'Keterangan'],
            ['1', 'Isi data hanya pada sheet Data Anggota mulai baris 2.'],
            ['2', 'Jangan mengubah nama, urutan, atau jumlah kolom header.'],
            ['3', 'Tujuh kolom: name, username, nis_nip, member_type, kelas, jabatan, password.'],
            ['4', 'Kolom wajib untuk semua anggota: name, username, member_type, dan password.'],
            ['5', 'member_type dipilih dari dropdown: student atau staff.'],
            ['6', 'Untuk student: tulis kelas pada SATU kolom kelas, contoh: 10 TKJ A. Tidak perlu lagi dipisah per tingkat dan jurusan.'],
            ['7', 'Kolom kelas diketik manual tanpa dropdown, jadi bisa disalin-tempel sekaligus. Penulisannya bebas: "X TKJ 1", "10-TKJ-A", dan "Kelas 10 Teknik Komputer dan Jaringan A" semuanya terbaca.'],
            ['8', 'Urutannya tingkat, lalu jurusan, lalu rombel. Tingkat boleh angka atau Romawi; jurusan boleh kode atau nama lengkap.'],
            ['9', 'Tingkat, jurusan, atau rombel yang belum terdaftar dibuatkan otomatis pada tahun ajaran aktif dan dicatat di hasil import.'],
            ['10', 'Karena dibuat otomatis, periksa ejaan kelas sebelum mengunggah agar master akademik tidak terisi data salah tulis.'],
            ['11', 'Bila kolom kelas dikosongkan, siswa tetap tersimpan tanpa kelas dan dapat dilengkapi lewat halaman Anggota.'],
            ['12', 'Untuk staff: isi kolom jabatan dan biarkan kolom kelas kosong.'],
            ['13', 'Password awal minimal 8 karakter. Gunakan password unik dan aman.'],
            ['14', 'Username, NIS/NIP, kelas, dan password diformat sebagai teks agar format aslinya dipertahankan.'],
            ['15', 'Baris dengan username atau NIS/NIP yang sudah terdaftar tidak gagal: data anggota lama diperbarui dan password lamanya tetap berlaku.'],
            ['16', 'Jika username sudah dipakai anggota lain, sistem menambahkan angka di belakangnya dan mencatatnya di hasil import.'],
            ['17', 'Sheet Master hanya referensi daftar kelas aktif, tidak wajib diikuti. Sheet Master dan Contoh tidak akan diimpor.'],
            ['', 'Simpan sebagai XLSX, lalu unggah melalui halaman Anggota. Maksimal 5 MB.'],
        ], null, 'A1');
        $sheet->mergeCells('A1:B1');
        $sheet->getStyle('A1:B1')->applyFromArray([
            'font' => ['bold' => true, 'size' => 16, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1E3A8A']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        $sheet->getStyle('A2:B2')->getFont()->setBold(true);
        $sheet->getColumnDimension('A')->setWidth(14);
        $sheet->getColumnDimension('B')->setWidth(95);
        $sheet->getStyle('A1:B21')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
        $sheet->freezePane('A3');
    }

    private function buildExampleSheet(Worksheet $sheet, Collection $classes, array $levels, Collection $majors): void
    {
        $level = $levels[0] ?? '10';
        $major = $majors->first()?->code ?? 'TKJ';
        $kelas = $classes->first() ?? trim("{$level} {$major} A");
        $sheet->setTitle('Contoh');
        $sheet->fromArray([
            self::HEADERS,
            ['Budi Santoso', 'budi.santoso', '20260001', 'student', $kelas, '', 'Budi#2026'],
            ['Dewi Lestari', 'dewi.lestari', '20260002', 'student', trim("{$level} {$major} B"), '', 'Dewi#2026'],
            ['Siti Aminah', 'siti.aminah', '19876543', 'staff', '', 'Pustakawan', 'Siti#2026'],
            ['Anggota Tanpa Kelas', 'anggota.baru', '20260003', 'student', '', '', 'Baru#2026'],
        ], null, 'A1');
        $sheet->getStyle('A1:G1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1E3A8A']],
        ]);
        foreach (range('A', 'G') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
        foreach (['B', 'C', 'E', 'G'] as $column) {
            $sheet->getStyle("{$column}2:{$column}5")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        }
    }

    public function show(ImportJob $importJob): JsonResponse
    {
        return response()->json(['data' => $importJob->load('failures')]);
    }
}
