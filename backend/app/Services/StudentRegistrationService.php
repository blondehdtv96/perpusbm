<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class StudentRegistrationService
{
    public function __construct(private readonly MemberService $members) {}

    public function register(array $data): User
    {
        $classGroup = $this->members->activeClassGroups()
            ->with(['academicYear', 'educationLevel', 'major'])
            ->findOrFail($data['class_group_id']);

        return DB::transaction(function () use ($data, $classGroup): User {
            $user = User::create([
                'name' => $data['name'],
                'username' => $data['nis'],
                'password' => $data['password'],
                'nis_nip' => $data['nis'],
                'member_type' => 'student',
                'class_or_position' => $classGroup->display_name,
                'status' => 'active',
            ]);
            $user->assignRole('student');
            $this->members->syncProfile($user, $classGroup);

            return $user->load([
                'student.currentAssignment.classGroup.educationLevel',
                'student.currentAssignment.classGroup.major',
                'libraryMember',
            ]);
        });
    }
}
