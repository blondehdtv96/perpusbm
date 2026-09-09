<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassGroup;
use App\Services\StudentRegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StudentRegistrationController extends Controller
{
    public function options(): JsonResponse
    {
        $classes = ClassGroup::with([
            'academicYear:id,name',
            'educationLevel:id,name',
            'major:id,code,name',
        ])
            ->where('is_active', true)
            ->whereHas('academicYear', fn ($query) => $query->where('is_active', true))
            ->whereHas('educationLevel', fn ($query) => $query->where('is_active', true))
            ->whereHas('major', fn ($query) => $query->where('is_active', true))
            ->orderBy('education_level_id')
            ->orderBy('major_id')
            ->orderBy('group_name')
            ->get()
            ->map(fn (ClassGroup $group) => [
                'id' => $group->id,
                'name' => $group->display_name,
                'academic_year' => $group->academicYear->name,
                'level' => $group->educationLevel->name,
                'major_code' => $group->major->code,
                'major' => $group->major->name,
            ]);

        return response()->json(['data' => [
            'academic_years' => AcademicYear::where('is_active', true)->orderByDesc('name')->get(['id', 'name']),
            'classes' => $classes,
        ]]);
    }

    public function store(Request $request, StudentRegistrationService $service): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'nis' => ['required', 'string', 'max:100', 'regex:/^[0-9]+$/', 'unique:users,username', 'unique:students,nis'], 'email' => ['nullable', 'email', 'max:255', 'unique:users,email'], 'phone' => ['required', 'string', 'min:8', 'max:30', 'regex:/^[0-9+]+$/'], 'class_group_id' => ['required', Rule::exists('class_groups', 'id')->where('is_active', true)], 'password' => ['nullable', 'string', 'min:8', 'confirmed']]);
        $user = $service->register($data);
        return response()->json(['message' => 'Pendaftaran berhasil. Silakan masuk menggunakan NIS.', 'data' => ['username' => $user->username, 'member_number' => $user->libraryMember->member_number]], 201);
    }
}
