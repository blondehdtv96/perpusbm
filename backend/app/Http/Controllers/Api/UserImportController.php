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
    /** Template berjalan: siswa ditempatkan lewat tingkat, jurusan, dan kelas dari master akademik. */
    private const HEADERS = ['name', 'username', 'nis_nip', 'member_type', 'tingkat', 'jurusan', 'kelas', 'jabatan', 'password'];

    /** Template lama tetap diterima supaya berkas yang sudah disiapkan petugas tidak terbuang. */
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
            $legacy = $this->headerLayout($headers);

            $created = 0;
            $updated = 0;
            $failed = 0;
            $processed = 0;
            $notes = [];
            $newClasses = [];
            $masters = $this->masters();

            if ($legacy) {
                $notes[] = ['row_number' => 1, 'username' => null, 'message' => 'Berkas memakai template lama, jadi kolom kelas/jabatan disimpan sebagai teks biasa tanpa penempatan kelas. Unduh template terbaru untuk menempatkan siswa pada tingkat, jurusan, dan kelas.'];
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
                $validator = Validator::make($row, $this->rules($legacy), $this->messages());

                if ($validator->fails()) {
                    $this->recordFailure($job, $rowNumber, $row, $validator->errors()->toArray());
                    $failed++;

                    continue;
                }

                $data = $validator->validated();
                $password = $data['password'];
                unset($data['password']);

                $placement = $legacy
                    ? ['class_group' => null, 'errors' => [], 'notes' => [], 'created_class' => null, 'label' => $data['class_or_position'] ?? null]
                    : $this->resolvePlacement($data, $masters);

                if ($placement['errors']) {
                    $this->recordFailure($job, $rowNumber, $row, $placement['errors']);
                    $failed++;

                    continue;
                }

                if ($placement['created_class']) {
                    $newClasses[] = $placement['created_class'];
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
            if ($newClasses) {
                ActivityLogger::log($request, 'academic.classes.created_by_import', $job, ['classes' => $newClasses]);
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
     * Menentukan tata letak berkas. Mengembalikan true bila berkas memakai template lama,
     * dan melempar pesan yang menyebut kedua susunan header bila tidak dikenali sama sekali.
     */
    private function headerLayout(array $headers): bool
    {
        if ($headers === self::HEADERS) {
            return false;
        }
        if ($headers === self::LEGACY_HEADERS) {
            return true;
        }

        throw ValidationException::withMessages([
            'file' => [
                'Header template tidak valid. Unduh template terbaru dan jangan mengubah nama atau urutan kolom. '
                .'Header wajib: '.implode(', ', self::HEADERS).'. '
                .'Template lama juga masih diterima: '.implode(', ', self::LEGACY_HEADERS).'.',
            ],
        ]);
    }

    private function rules(bool $legacy): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/'],
            'nis_nip' => ['nullable', 'string', 'max:100'],
            'member_type' => ['required', 'in:student,staff'],
            'password' => ['required', 'string', 'min:8'],
        ];

        if ($legacy) {
            return [...$rules, 'class_or_position' => ['nullable', 'string', 'max:255']];
        }

        return [...$rules,
            'tingkat' => ['nullable', 'string', 'max:30'],
            'jurusan' => ['nullable', 'string', 'max:150'],
            'kelas' => ['nullable', 'string', 'max:30'],
            'jabatan' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function messages(): array
    {
        return [
            'member_type.in' => 'Tipe anggota harus student atau staff.',
            'password.required' => 'Password awal wajib diisi.',
            'password.min' => 'Password awal minimal 8 karakter.',
            'tingkat.max' => 'Tingkat maksimal :max karakter, contoh: 10.',
            'jurusan.max' => 'Jurusan maksimal :max karakter. Isi dengan kode jurusan, contoh: TKJ.',
            'kelas.max' => 'Kelas (rombel) maksimal :max karakter, contoh: A.',
        ];
    }

    /** @return array{levels: Collection, majors: Collection} */
    private function masters(): array
    {
        return [
            'levels' => EducationLevel::query()->where('is_active', true)->get(),
            'majors' => Major::query()->where('is_active', true)->get(),
        ];
    }

    /**
     * Menerjemahkan kolom tingkat, jurusan, dan kelas menjadi satu kelas pada master akademik.
     * Tingkat dan jurusan harus sudah ada supaya salah tulis tidak mengotori master, sedangkan
     * rombel yang belum ada dibuatkan otomatis pada tahun ajaran aktif dan dicatat sebagai catatan.
     *
     * @return array{class_group: ?ClassGroup, errors: array<string, array<int, string>>, notes: array<int, string>, created_class: ?string, label: ?string}
     */
    private function resolvePlacement(array $data, array $masters): array
    {
        $result = ['class_group' => null, 'errors' => [], 'notes' => [], 'created_class' => null, 'label' => null];
        $isStudent = $data['member_type'] === 'student';
        $level = $data['tingkat'] ?? null;
        $major = $data['jurusan'] ?? null;
        $group = $data['kelas'] ?? null;
        $position = $data['jabatan'] ?? null;
        $filled = array_filter([$level, $major, $group], fn (?string $value) => $value !== null);

        if (! $isStudent) {
            $result['label'] = $position;
            if ($filled) {
                $result['notes'][] = 'Anggota bertipe staff, jadi kolom tingkat, jurusan, dan kelas diabaikan dan hanya jabatan yang disimpan.';
            }
            if ($position === null) {
                $result['notes'][] = 'Kolom jabatan kosong, jabatan anggota dapat dilengkapi lewat halaman Anggota.';
            }

            return $result;
        }

        if ($position !== null) {
            $result['notes'][] = 'Anggota bertipe student, jadi kolom jabatan diabaikan dan kelas dipakai sebagai keterangan.';
        }

        if (! $filled) {
            $result['notes'][] = 'Tingkat, jurusan, dan kelas belum diisi, jadi siswa ini tersimpan tanpa penempatan kelas. Lengkapi lewat halaman Anggota.';

            return $result;
        }

        if (count($filled) < 3) {
            $result['errors']['kelas'] = ['Penempatan siswa butuh tingkat, jurusan, dan kelas sekaligus. Lengkapi ketiga kolom tersebut atau kosongkan semuanya.'];

            return $result;
        }

        $levelModel = $this->members->matchLevel($level, $masters['levels']);
        if (! $levelModel) {
            $result['errors']['tingkat'] = ["Tingkat \"{$level}\" tidak ada pada master akademik yang aktif. Tambahkan tingkat tersebut di menu Struktur akademik lalu ulangi import."];
        }

        $majorModel = $this->members->matchMajor($major, $masters['majors']);
        if (! $majorModel) {
            $result['errors']['jurusan'] = ["Jurusan \"{$major}\" tidak ada pada master akademik yang aktif. Pakai kode jurusan yang tercantum pada sheet Master, contoh: TKJ."];
        }

        $year = $this->members->activeAcademicYear();
        if (! $year) {
            $result['errors']['kelas'] = ['Tahun ajaran aktif belum tersedia. Tambahkan tahun ajaran di menu Struktur akademik sebelum menempatkan siswa.'];
        }

        if ($result['errors']) {
            return $result;
        }

        $groupName = mb_strtoupper($group);
        $keys = [
            'academic_year_id' => $year->id,
            'education_level_id' => $levelModel->id,
            'major_id' => $majorModel->id,
            'group_name' => $groupName,
        ];
        $classGroup = ClassGroup::query()->where($keys)->with(['academicYear', 'educationLevel', 'major'])->first();

        if ($classGroup && ! $classGroup->is_active) {
            $result['errors']['kelas'] = ["Kelas {$classGroup->display_name} sedang nonaktif. Aktifkan kelas tersebut di menu Struktur akademik lalu ulangi import."];

            return $result;
        }

        if (! $classGroup) {
            $classGroup = ClassGroup::create([...$keys, 'is_active' => true])->load(['academicYear', 'educationLevel', 'major']);
            $result['created_class'] = $classGroup->display_name;
            $result['notes'][] = "Kelas {$classGroup->display_name} belum ada pada master akademik tahun {$year->name} dan dibuatkan otomatis.";
        }

        $result['class_group'] = $classGroup;
        $result['label'] = $classGroup->display_name;

        return $result;
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
            ->get();
        $rombels = $classes->pluck('group_name')->unique()->sort()->values()->all();

        return response()->streamDownload(function () use ($levels, $majors, $classes, $rombels): void {
            $spreadsheet = new Spreadsheet;
            $this->buildDataSheet($spreadsheet->getActiveSheet(), count($levels), $majors->count(), count($rombels));
            $this->buildMasterSheet($spreadsheet->createSheet(), $levels, $majors, $classes, $rombels);
            $this->buildGuideSheet($spreadsheet->createSheet());
            $this->buildExampleSheet($spreadsheet->createSheet(), $levels, $majors, $rombels);
            $spreadsheet->setActiveSheetIndex(0);
            (new Xlsx($spreadsheet))->save('php://output');
            $spreadsheet->disconnectWorksheets();
        }, 'template-import-anggota.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function buildDataSheet(Worksheet $sheet, int $levelCount, int $majorCount, int $rombelCount): void
    {
        $lastRow = 1000;
        $sheet->setTitle('Data Anggota');
        $sheet->fromArray(self::HEADERS, null, 'A1');
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:I{$lastRow}");
        $sheet->getStyle('A1:I1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1D4ED8']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        // Kolom penempatan siswa diberi warna berbeda agar petugas langsung melihat kelompoknya.
        $sheet->getStyle('E1:G1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('0F766E');
        $sheet->getStyle('H1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('B45309');
        $sheet->getStyle("A1:I{$lastRow}")->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
        foreach (['B', 'C', 'E', 'G', 'I'] as $column) {
            $sheet->getStyle("{$column}2:{$column}{$lastRow}")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        }
        foreach (['A' => 26, 'B' => 20, 'C' => 18, 'D' => 14, 'E' => 10, 'F' => 14, 'G' => 10, 'H' => 24, 'I' => 20] as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }

        $lists = [
            'D' => ['formula' => '"student,staff"', 'title' => 'Tipe tidak valid', 'error' => 'Pilih student atau staff dari daftar.', 'blank' => false],
            'E' => ['formula' => $levelCount > 0 ? 'Master!$A$2:$A$'.($levelCount + 1) : null, 'title' => 'Tingkat tidak valid', 'error' => 'Pilih tingkat dari sheet Master. Kosongkan bila anggota bukan siswa.', 'blank' => true],
            'F' => ['formula' => $majorCount > 0 ? 'Master!$B$2:$B$'.($majorCount + 1) : null, 'title' => 'Jurusan tidak valid', 'error' => 'Pilih kode jurusan dari sheet Master. Kosongkan bila anggota bukan siswa.', 'blank' => true],
            'G' => ['formula' => $rombelCount > 0 ? 'Master!$D$2:$D$'.($rombelCount + 1) : null, 'title' => 'Kelas tidak dikenal', 'error' => 'Kelas boleh berisi rombel baru, misalnya A atau B.', 'blank' => true, 'warn' => true],
        ];

        // Satu objek validasi per kolom (bukan per sel) supaya berkas template tetap ringan.
        foreach ($lists as $column => $list) {
            if ($list['formula'] === null) {
                continue;
            }
            $validation = new DataValidation;
            $validation->setType(DataValidation::TYPE_LIST)
                ->setErrorStyle(($list['warn'] ?? false) ? DataValidation::STYLE_WARNING : DataValidation::STYLE_STOP)
                ->setAllowBlank($list['blank'])
                ->setShowDropDown(true)
                ->setShowErrorMessage(true)
                ->setErrorTitle($list['title'])
                ->setError($list['error'])
                ->setFormula1($list['formula']);
            $sheet->setDataValidation("{$column}2:{$column}{$lastRow}", $validation);
        }
    }

    private function buildMasterSheet(Worksheet $sheet, array $levels, Collection $majors, Collection $classes, array $rombels): void
    {
        $sheet->setTitle('Master');
        $sheet->fromArray(['tingkat', 'kode jurusan', 'nama jurusan', 'kelas (rombel)', 'kelas aktif yang sudah ada'], null, 'A1');
        $sheet->fromArray(array_map(fn (string $level) => [$level], $levels), null, 'A2');
        $sheet->fromArray($majors->map(fn ($major) => [$major->code, $major->name])->all(), null, 'B2');
        $sheet->fromArray(array_map(fn (string $rombel) => [$rombel], $rombels), null, 'D2');
        $sheet->fromArray($classes->map(fn (ClassGroup $group) => [$group->display_name])->all(), null, 'E2');
        $sheet->getStyle('A1:E1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '0F766E']],
        ]);
        $sheet->getStyle('A2:A200')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        foreach (['A' => 12, 'B' => 16, 'C' => 42, 'D' => 16, 'E' => 32] as $column => $width) {
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
            ['3', 'Sembilan kolom: name, username, nis_nip, member_type, tingkat, jurusan, kelas, jabatan, password.'],
            ['4', 'Kolom wajib untuk semua anggota: name, username, member_type, dan password.'],
            ['5', 'member_type dipilih dari dropdown: student atau staff.'],
            ['6', 'Untuk student: isi tingkat, jurusan, dan kelas sekaligus. Pilihannya ada pada sheet Master.'],
            ['7', 'Tingkat boleh ditulis 10 atau X; jurusan memakai kode seperti TKJ; kelas adalah rombel seperti A.'],
            ['8', 'Kelas (rombel) yang belum ada akan dibuatkan otomatis pada tahun ajaran aktif dan dicatat di hasil import.'],
            ['9', 'Tingkat dan jurusan harus sudah ada di master akademik. Bila belum, tambahkan dulu di menu Struktur akademik.'],
            ['10', 'Bila ketiga kolom penempatan dikosongkan, siswa tetap tersimpan tanpa kelas dan dapat dilengkapi lewat halaman Anggota.'],
            ['11', 'Untuk staff: isi kolom jabatan, dan biarkan tingkat, jurusan, serta kelas kosong.'],
            ['12', 'Password awal minimal 8 karakter. Gunakan password unik dan aman.'],
            ['13', 'Username, NIS/NIP, tingkat, kelas, dan password diformat sebagai teks agar format aslinya dipertahankan.'],
            ['14', 'Baris dengan username atau NIS/NIP yang sudah terdaftar tidak gagal: data anggota lama diperbarui dan password lamanya tetap berlaku.'],
            ['15', 'Jika username sudah dipakai anggota lain, sistem menambahkan angka di belakangnya dan mencatatnya di hasil import.'],
            ['16', 'Sheet Master dan Contoh hanya panduan dan tidak akan diimpor.'],
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
        $sheet->getStyle('A1:B20')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
        $sheet->freezePane('A3');
    }

    private function buildExampleSheet(Worksheet $sheet, array $levels, Collection $majors, array $rombels): void
    {
        $level = $levels[0] ?? '10';
        $major = $majors->first()?->code ?? 'TKJ';
        $rombel = $rombels[0] ?? 'A';
        $sheet->setTitle('Contoh');
        $sheet->fromArray([
            self::HEADERS,
            ['Budi Santoso', 'budi.santoso', '20260001', 'student', $level, $major, $rombel, '', 'Budi#2026'],
            ['Siti Aminah', 'siti.aminah', '19876543', 'staff', '', '', '', 'Pustakawan', 'Siti#2026'],
            ['Anggota Tanpa Kelas', 'anggota.baru', '20260002', 'student', '', '', '', '', 'Baru#2026'],
        ], null, 'A1');
        $sheet->getStyle('A1:I1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1E3A8A']],
        ]);
        foreach (range('A', 'I') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
        foreach (['B', 'C', 'E', 'G', 'I'] as $column) {
            $sheet->getStyle("{$column}2:{$column}4")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        }
    }

    public function show(ImportJob $importJob): JsonResponse
    {
        return response()->json(['data' => $importJob->load('failures')]);
    }
}
