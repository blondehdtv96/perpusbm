<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassGroup;
use App\Models\EducationLevel;
use App\Models\Major;
use App\Services\ActivityLogger;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AcademicMasterController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => [
            'years' => AcademicYear::orderByDesc('name')->get(),
            'levels' => EducationLevel::orderBy('sort_order')->get(),
            'majors' => Major::orderBy('code')->get(),
            'classes' => ClassGroup::with(['academicYear:id,name', 'educationLevel:id,name', 'major:id,code,name'])
                ->withCount('assignments')->latest()->get()->each->append('display_name'),
        ]]);
    }

    public function storeYear(Request $request): JsonResponse { $data = $request->validate(['name' => ['required', 'regex:/^\d{4}\/\d{4}$/', 'unique:academic_years,name'], 'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date', 'after:starts_at']]); return $this->created(AcademicYear::create([...$data, 'is_active' => true])); }
    public function storeLevel(Request $request): JsonResponse { $data = $request->validate(['name' => ['required', 'string', 'max:30', 'unique:education_levels,name'], 'sort_order' => ['nullable', 'integer', 'min:0', 'max:255']]); return $this->created(EducationLevel::create([...$data, 'is_active' => true])); }

    public function storeMajor(Request $request): JsonResponse
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        $data = $request->validate(['code' => ['required', 'string', 'max:20', 'unique:majors,code'], 'name' => ['required', 'string', 'max:150']]);

        return $this->created(Major::create([...$data, 'is_active' => true]));
    }

    public function storeClass(Request $request): JsonResponse
    {
        $classGroup = ClassGroup::create([...$this->classData($request), 'is_active' => true]);
        ActivityLogger::log($request, 'academic.class.created', $classGroup, $classGroup->only(['academic_year_id', 'education_level_id', 'major_id', 'group_name']));

        return $this->created($this->classPayload($classGroup));
    }

    public function updateClass(Request $request, ClassGroup $classGroup): JsonResponse
    {
        if ($classGroup->assignments()->exists()) {
            return response()->json(['message' => 'Kelas yang sudah memiliki histori siswa tidak dapat diubah. Nonaktifkan kelas dan buat kelas pengganti.'], 409);
        }

        $before = $classGroup->only(['academic_year_id', 'education_level_id', 'major_id', 'group_name']);
        $classGroup->update($this->classData($request, $classGroup));
        ActivityLogger::log($request, 'academic.class.updated', $classGroup, ['before' => $before, 'after' => $classGroup->only(array_keys($before))]);

        return response()->json(['data' => $this->classPayload($classGroup)]);
    }

    public function destroyClass(Request $request, ClassGroup $classGroup): JsonResponse
    {
        if ($classGroup->assignments()->exists()) {
            return response()->json(['message' => 'Kelas tidak dapat dihapus karena sudah memiliki histori siswa. Nonaktifkan kelas untuk mempertahankan histori.'], 409);
        }

        $snapshot = $classGroup->only(['academic_year_id', 'education_level_id', 'major_id', 'group_name']);
        try {
            $classGroup->delete();
        } catch (QueryException) {
            return response()->json(['message' => 'Kelas masih digunakan dan tidak dapat dihapus.'], 409);
        }
        ActivityLogger::log($request, 'academic.class.deleted', $classGroup, $snapshot);

        return response()->json(status: 204);
    }

    public function toggle(Request $request, string $type, int $id): JsonResponse
    {
        $model = $this->model($type)::findOrFail($id);
        if ($model instanceof ClassGroup && ! $model->is_active) {
            $model->load(['academicYear', 'educationLevel', 'major']);
            if (! $model->academicYear?->is_active || ! $model->educationLevel?->is_active || ! $model->major?->is_active) {
                return response()->json(['message' => 'Kelas tidak dapat diaktifkan karena salah satu master induknya nonaktif.'], 422);
            }
        }

        $model->update(['is_active' => ! $model->is_active]);
        ActivityLogger::log($request, 'academic.'.$type.'.toggled', $model, ['is_active' => $model->is_active]);

        return response()->json(['data' => $model]);
    }

    private function classData(Request $request, ?ClassGroup $classGroup = null): array
    {
        $request->merge(['group_name' => strtoupper(trim((string) $request->input('group_name')))]);
        $unique = Rule::unique('class_groups')->where(fn ($query) => $query
            ->where('academic_year_id', $request->integer('academic_year_id'))
            ->where('education_level_id', $request->integer('education_level_id'))
            ->where('major_id', $request->integer('major_id')));
        if ($classGroup) {
            $unique->ignore($classGroup->id);
        }

        return $request->validate([
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where(fn ($query) => $query->where('is_active', true)->when($classGroup, fn ($nested) => $nested->orWhere('id', $classGroup->academic_year_id)))],
            'education_level_id' => ['required', Rule::exists('education_levels', 'id')->where(fn ($query) => $query->where('is_active', true)->when($classGroup, fn ($nested) => $nested->orWhere('id', $classGroup->education_level_id)))],
            'major_id' => ['required', Rule::exists('majors', 'id')->where(fn ($query) => $query->where('is_active', true)->when($classGroup, fn ($nested) => $nested->orWhere('id', $classGroup->major_id)))],
            'group_name' => ['required', 'string', 'max:30', $unique],
        ]);
    }

    private function classPayload(ClassGroup $classGroup): ClassGroup
    {
        return $classGroup->load(['academicYear:id,name', 'educationLevel:id,name', 'major:id,code,name'])
            ->loadCount('assignments')->append('display_name');
    }

    private function model(string $type): string { return match ($type) { 'years' => AcademicYear::class, 'levels' => EducationLevel::class, 'majors' => Major::class, 'classes' => ClassGroup::class, default => abort(404) }; }
    private function created(Model $model): JsonResponse { return response()->json(['data' => $model], 201); }
}
