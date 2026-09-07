<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookCategory;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => BookCategory::withCount('books')->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', 'unique:book_categories,name'], 'description' => ['nullable', 'string']]);
        $category = BookCategory::create([...$data, 'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(5))]);
        ActivityLogger::log($request, 'category.created', $category, $data);

        return response()->json(['data' => $category], 201);
    }

    public function update(Request $request, BookCategory $category): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('book_categories', 'name')->ignore($category)], 'description' => ['nullable', 'string']]);
        $category->update([...$data, 'slug' => Str::slug($data['name']).'-'.$category->id]);
        ActivityLogger::log($request, 'category.updated', $category, $data);

        return response()->json(['data' => $category]);
    }

    public function destroy(Request $request, BookCategory $category): JsonResponse
    {
        abort_if($category->books()->exists(), 422, 'Kategori yang masih digunakan tidak dapat dihapus.');
        $category->delete();
        ActivityLogger::log($request, 'category.deleted', $category);

        return response()->json(status: 204);
    }
}
