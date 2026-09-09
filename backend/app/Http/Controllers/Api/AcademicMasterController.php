<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassGroup;
use App\Models\EducationLevel;
use App\Models\Major;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AcademicMasterController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['years' => AcademicYear::orderByDesc('name')->get(), 'levels' => EducationLevel::orderBy('sort_order')->get(), 'majors' => Major::orderBy('code')->get(), 'classes' => ClassGroup::with(['academicYear:id,name', 'educationLevel:id,name', 'major:id,code,name'])->latest()->get()->each->append('display_name')]]);
    }
    public function storeYear(Request $request): JsonResponse { $data = $request->validate(['name' => ['required', 'regex:/^\d{4}\/\d{4}$/', 'unique:academic_years,name'], 'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date', 'after:starts_at']]); return $this->created(AcademicYear::create([...$data, 'is_active' => true])); }
    public function storeLevel(Request $request): JsonResponse { $data = $request->validate(['name' => ['required', 'string', 'max:30', 'unique:education_levels,name'], 'sort_order' => ['nullable', 'integer', 'min:0', 'max:255']]); return $this->created(EducationLevel::create([...$data, 'is_active' => true])); }
    public function storeMajor(Request $request): JsonResponse
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        $data = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:majors,code'],
            'name' => ['required', 'string', 'max:150'],
        ]);

        return $this->created(Major::create([...$data, 'is_active' => true]));
    }

    public function storeClass(Request $request): JsonResponse
    {
        $request->merge(['group_name' => strtoupper(trim((string) $request->input('group_name')))]);
        $data = $request->validate([
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where('is_active', true)],
            'education_level_id' => ['required', Rule::exists('education_levels', 'id')->where('is_active', true)],
            'major_id' => ['required', Rule::exists('majors', 'id')->where('is_active', true)],
            'group_name' => ['required', 'string', 'max:30', Rule::unique('class_groups')->where(fn ($q) => $q
                ->where('academic_year_id', $request->academic_year_id)
                ->where('education_level_id', $request->education_level_id)
                ->where('major_id', $request->major_id))],
        ]);

        return $this->created(ClassGroup::create([...$data, 'is_active' => true])
            ->load(['academicYear', 'educationLevel', 'major'])->append('display_name'));
    }
    public function toggle(string $type, int $id): JsonResponse { $model = $this->model($type)::findOrFail($id); $model->update(['is_active' => ! $model->is_active]); return response()->json(['data' => $model]); }
    private function model(string $type): string { return match ($type) { 'years' => AcademicYear::class, 'levels' => EducationLevel::class, 'majors' => Major::class, 'classes' => ClassGroup::class, default => abort(404) }; }
    private function created(Model $model): JsonResponse { return response()->json(['data' => $model], 201); }
}
