<?php

namespace App\Services;

use App\Models\ClassGroup;
use App\Models\LibraryMember;
use App\Models\Student;
use App\Models\StudentClassAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StudentRegistrationService
{
    public function register(array $data): User
    {
        $classGroup = ClassGroup::with(['academicYear', 'educationLevel', 'major'])
            ->where('is_active', true)
            ->whereHas('academicYear', fn ($query) => $query->where('is_active', true))
            ->whereHas('educationLevel', fn ($query) => $query->where('is_active', true))
            ->whereHas('major', fn ($query) => $query->where('is_active', true))
            ->findOrFail($data['class_group_id']);

        return DB::transaction(function () use ($data, $classGroup): User {
            $password = $data['password'] ?? $data['phone'];
            $email = filled($data['email'] ?? null)
                ? $data['email']
                : "{$data['nis']}@siswa.bmlibrary.local";

            $user = User::create([
                'name' => $data['name'],
                'username' => $data['nis'],
                'email' => $email,
                'password' => $password,
                'nis_nip' => $data['nis'],
                'phone' => $data['phone'],
                'member_type' => 'student',
                'class_or_position' => $classGroup->display_name,
                'status' => 'active',
            ]);
            $user->assignRole('student');

            $student = Student::create(['user_id' => $user->id, 'nis' => $data['nis']]);
            $year = substr($classGroup->academicYear->name, 0, 4);
            LibraryMember::create([
                'user_id' => $user->id,
                'member_number' => sprintf('LIB-%s-%06d', $year, $user->id),
                'status' => 'active',
                'joined_at' => now()->toDateString(),
            ]);
            StudentClassAssignment::create([
                'student_id' => $student->id,
                'class_group_id' => $classGroup->id,
                'academic_year_id' => $classGroup->academic_year_id,
                'assigned_at' => now()->toDateString(),
                'is_active' => true,
            ]);

            return $user->load([
                'student.currentAssignment.classGroup.educationLevel',
                'student.currentAssignment.classGroup.major',
                'libraryMember',
            ]);
        });
    }
}
