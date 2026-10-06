<?php

namespace App\Services;

use App\Models\AcademicYear;
use App\Models\ClassGroup;
use App\Models\EducationLevel;
use App\Models\LibraryMember;
use App\Models\Major;
use App\Models\Student;
use App\Models\StudentClassAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Satu pintu untuk konsep keanggotaan: nomor anggota, data siswa, dan penempatan kelas.
 * Dipakai bersama oleh form tambah anggota, import anggota, dan registrasi siswa mandiri
 * supaya ketiganya tidak pernah menghasilkan bentuk data yang berbeda.
 */
class MemberService
{
    /** Relasi yang dibutuhkan untuk menampilkan anggota beserta penempatan kelasnya. */
    public const RELATIONS = [
        'roles:id,name',
        'libraryMember:id,user_id,member_number,status,joined_at',
        'student.currentAssignment.academicYear:id,name',
        'student.currentAssignment.classGroup.educationLevel:id,name',
        'student.currentAssignment.classGroup.major:id,code,name',
    ];

    /**
     * Kelas yang boleh dipakai untuk menempatkan anggota: kelas aktif yang
     * seluruh master induknya (tahun ajaran, tingkat, jurusan) juga aktif.
     */
    public function activeClassGroups(): Builder
    {
        return ClassGroup::query()
            ->where('is_active', true)
            ->whereHas('academicYear', fn (Builder $query) => $query->where('is_active', true))
            ->whereHas('educationLevel', fn (Builder $query) => $query->where('is_active', true))
            ->whereHas('major', fn (Builder $query) => $query->where('is_active', true));
    }

    public function findActiveClassGroup(int|string|null $id): ?ClassGroup
    {
        if ($id === null || $id === '') {
            return null;
        }

        return $this->activeClassGroups()
            ->with(['academicYear', 'educationLevel', 'major'])
            ->find((int) $id);
    }

    /** Pilihan yang dipakai form tambah anggota agar tingkat, jurusan, dan kelas bisa bertingkat. */
    public function formOptions(): array
    {
        $classes = $this->activeClassGroups()
            ->with(['academicYear:id,name', 'educationLevel:id,name,sort_order', 'major:id,code,name'])
            ->orderBy('academic_year_id')
            ->orderBy('education_level_id')
            ->orderBy('major_id')
            ->orderBy('group_name')
            ->get()
            ->map(fn (ClassGroup $group) => [
                'id' => $group->id,
                'academic_year_id' => $group->academic_year_id,
                'education_level_id' => $group->education_level_id,
                'major_id' => $group->major_id,
                'group_name' => $group->group_name,
                'display_name' => $group->display_name,
                'academic_year' => $group->academicYear?->name,
                'level' => $group->educationLevel?->name,
                'major_code' => $group->major?->code,
                'major' => $group->major?->name,
            ]);

        return [
            'academic_years' => AcademicYear::query()->where('is_active', true)->orderByDesc('name')->get(['id', 'name']),
            'levels' => EducationLevel::query()->where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'sort_order']),
            'majors' => Major::query()->where('is_active', true)->orderBy('code')->get(['id', 'code', 'name']),
            'classes' => $classes,
            'default_academic_year_id' => $this->activeAcademicYear()?->id,
        ];
    }

    public function activeAcademicYear(): ?AcademicYear
    {
        return AcademicYear::query()->where('is_active', true)->orderByDesc('name')->first();
    }

    /** Label yang disimpan pada users.class_or_position supaya daftar dan kartu tetap terbaca cepat. */
    public function placementLabel(?ClassGroup $classGroup, ?string $position): ?string
    {
        $label = $classGroup ? $classGroup->display_name : $position;

        return $label === null || trim($label) === '' ? null : trim($label);
    }

    /**
     * Pasang seluruh profil keanggotaan setelah baris users tersimpan: nomor anggota untuk
     * semua tipe, dan khusus siswa juga data siswa beserta penempatan kelas aktifnya.
     * Tanggal gabung hanya ditulis bila form mengirimkannya, selebihnya memakai tanggal hari ini.
     */
    public function syncProfile(User $user, ?ClassGroup $classGroup = null, ?string $joinedAt = null): User
    {
        return DB::transaction(function () use ($user, $classGroup, $joinedAt): User {
            $this->ensureMemberNumber($user, $joinedAt);

            if ($user->member_type !== 'student') {
                $this->endActiveAssignments($user);

                return $user;
            }

            if ($classGroup) {
                $this->assignClass($user, $classGroup);
            }

            return $user;
        });
    }

    /** Setiap anggota punya nomor anggota agar kartu dan pencarian manual selalu punya pegangan. */
    public function ensureMemberNumber(User $user, ?string $joinedAt = null): LibraryMember
    {
        $member = $user->libraryMember()->first();

        if ($member) {
            $changes = [];
            if ($member->status !== $user->status) {
                $changes['status'] = $user->status;
            }
            if ($joinedAt !== null && $member->joined_at?->toDateString() !== $joinedAt) {
                $changes['joined_at'] = $joinedAt;
            }
            if ($changes) {
                $member->update($changes);
            }

            return $member;
        }

        $member = LibraryMember::create([
            'user_id' => $user->id,
            'member_number' => $this->nextMemberNumber($user),
            'status' => $user->status ?? 'active',
            'joined_at' => $joinedAt ?? now()->toDateString(),
        ]);
        $user->setRelation('libraryMember', $member);

        return $member;
    }

    /**
     * Tempatkan siswa pada kelas. Penempatan lama ditutup, bukan dihapus, sehingga histori
     * kelas per tahun ajaran tetap utuh. Penempatan yang sama tidak diduplikasi.
     */
    public function assignClass(User $user, ClassGroup $classGroup): StudentClassAssignment
    {
        return DB::transaction(function () use ($user, $classGroup): StudentClassAssignment {
            $student = $this->ensureStudent($user);
            $current = $student->assignments()->where('is_active', true)->latest('id')->first();

            if ($current && (int) $current->class_group_id === (int) $classGroup->id) {
                return $current;
            }

            $student->assignments()->where('is_active', true)->update([
                'is_active' => false,
                'ended_at' => now()->toDateString(),
            ]);

            return StudentClassAssignment::create([
                'student_id' => $student->id,
                'class_group_id' => $classGroup->id,
                'academic_year_id' => $classGroup->academic_year_id,
                'assigned_at' => now()->toDateString(),
                'is_active' => true,
            ]);
        });
    }

    public function hasActivePlacement(User $user): bool
    {
        return $user->student()->whereHas('assignments', fn (Builder $query) => $query->where('is_active', true))->exists();
    }

    /** Dipakai saat anggota berpindah tipe menjadi staf: kelasnya ditutup, historinya disimpan. */
    public function endActiveAssignments(User $user): void
    {
        $student = $user->student()->first();

        $student?->assignments()->where('is_active', true)->update([
            'is_active' => false,
            'ended_at' => now()->toDateString(),
        ]);
    }

    /** Tingkat yang cocok dengan tulisan pada berkas import: "10", "X", atau "Kelas 10". */
    public function matchLevel(string $value, ?Collection $levels = null): ?EducationLevel
    {
        $needle = $this->normalizeLevel($value);
        if ($needle === '') {
            return null;
        }
        $levels ??= EducationLevel::query()->where('is_active', true)->get();

        return $levels->first(fn (EducationLevel $level) => $this->normalizeLevel($level->name) === $needle);
    }

    /** Jurusan dicocokkan dari kode (TKJ) maupun nama lengkapnya. */
    public function matchMajor(string $value, ?Collection $majors = null): ?Major
    {
        $needle = mb_strtolower(trim($value));
        if ($needle === '') {
            return null;
        }
        $majors ??= Major::query()->where('is_active', true)->get();

        return $majors->first(fn (Major $major) => mb_strtolower($major->code) === $needle || mb_strtolower($major->name) === $needle);
    }

    /**
     * Nama tingkat yang dipakai saat tingkat baru dibuat dari berkas import: angka Romawi
     * diseragamkan menjadi angka supaya master tidak berisi "X" dan "10" sekaligus.
     */
    public function canonicalLevelName(string $value): string
    {
        $normalized = $this->normalizeLevel($value);

        if (is_numeric($normalized)) {
            return $normalized;
        }

        return trim((string) preg_replace('/^(kelas|tingkat)\s+/iu', '', trim($value)));
    }

    private function ensureStudent(User $user): Student
    {
        $student = Student::query()->where('user_id', $user->id)->first() ?? new Student(['user_id' => $user->id]);
        $nis = $this->availableNis($user->nis_nip, $student);

        if ($student->exists && $student->nis === $nis) {
            return $student;
        }

        $student->fill(['user_id' => $user->id, 'nis' => $nis])->save();
        $user->setRelation('student', $student);

        return $student;
    }

    /**
     * NIS siswa mengikuti NIS/NIP pada akun, kecuali bila nilainya sudah terpakai siswa lain.
     * Dalam kasus itu NIS dibiarkan apa adanya supaya baris tetap bisa disimpan.
     */
    private function availableNis(?string $nisNip, Student $student): ?string
    {
        if ($nisNip === null) {
            return $student->exists ? $student->nis : null;
        }

        $taken = Student::query()->where('nis', $nisNip)
            ->when($student->exists, fn (Builder $query) => $query->whereKeyNot($student->getKey()))
            ->exists();

        return $taken ? ($student->exists ? $student->nis : null) : $nisNip;
    }

    private function nextMemberNumber(User $user): string
    {
        $year = substr((string) ($this->activeAcademicYear()?->name ?? now()->year), 0, 4);

        return sprintf('LIB-%s-%06d', $year, $user->id);
    }

    private function normalizeLevel(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = (string) preg_replace('/^(kelas|tingkat)\s+/u', '', $value);
        $roman = ['x' => '10', 'xi' => '11', 'xii' => '12', 'vii' => '7', 'viii' => '8', 'ix' => '9'];

        return $roman[$value] ?? $value;
    }
}
