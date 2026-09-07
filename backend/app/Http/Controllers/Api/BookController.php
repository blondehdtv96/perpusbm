<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Services\ActivityLogger;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $copyLoader = $this->copyLoader($request->user()->can('loans.view-all'));
        $books = Book::query()
            ->with(['category:id,name', 'copies' => $copyLoader])
            ->withCount([
                'copies',
                'copies as available_copies_count' => fn ($query) => $query
                    ->where('status', 'available')
                    ->whereDoesntHave('activeLoan'),
            ])
            ->when($request->string('search')->toString(), function ($query, string $search): void {
                $query->where(function ($nested) use ($search): void {
                    $nested->where('title', 'like', "%{$search}%")
                        ->orWhere('author', 'like', "%{$search}%")
                        ->orWhere('isbn', 'like', "%{$search}%")
                        ->orWhereHas('copies', fn ($copies) => $copies->where('inventory_code', 'like', "%{$search}%"));
                });
            })
            ->when($request->integer('category_id'), fn ($query, int $id) => $query->where('book_category_id', $id))
            ->latest()
            ->paginate(min($request->integer('per_page', 12), 50));

        return response()->json($books);
    }

    public function show(Request $request, Book $book): JsonResponse
    {
        $book->load(['category:id,name', 'copies' => $this->copyLoader($request->user()->can('loans.view-all'))]);
        $book->loadCount([
            'copies',
            'copies as available_copies_count' => fn ($query) => $query
                ->where('status', 'available')
                ->whereDoesntHave('activeLoan'),
        ]);

        return response()->json(['data' => $book]);
    }

    private function copyLoader(bool $canViewBorrowers): Closure
    {
        return function ($query) use ($canViewBorrowers): void {
            $query->select('id', 'book_id', 'inventory_code', 'status', 'shelf_location')
                ->with(['activeLoan' => function ($loanQuery) use ($canViewBorrowers): void {
                    $columns = ['id', 'active_copy_id', 'status', 'due_at'];
                    if ($canViewBorrowers) {
                        $columns[] = 'user_id';
                    }

                    $loanQuery->select($columns);
                    if ($canViewBorrowers) {
                        $loanQuery->with('user:id,name,nis_nip');
                    }
                }])
                ->orderBy('inventory_code');
        };
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'book_category_id' => ['nullable', 'exists:book_categories,id'],
            'title' => ['required', 'string', 'max:255'],
            'author' => ['required', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'isbn' => ['nullable', 'string', 'max:32', 'unique:books,isbn'],
            'description' => ['nullable', 'string'],
            'cover' => ['nullable', 'image', 'max:2048'],
            'copies' => ['nullable', 'integer', 'min:0', 'max:100'],
            'shelf_location' => ['nullable', 'string', 'max:100'],
        ]);

        $copyCount = (int) ($data['copies'] ?? 0);
        $shelf = $data['shelf_location'] ?? null;
        if ($request->hasFile('cover')) {
            $data['cover_path'] = $request->file('cover')->store('covers', 'public');
        }
        unset($data['copies'], $data['shelf_location'], $data['cover']);

        $book = DB::transaction(function () use ($data, $copyCount, $shelf): Book {
            $book = Book::create($data);

            for ($sequence = 1; $sequence <= $copyCount; $sequence++) {
                $book->copies()->create([
                    'inventory_code' => sprintf('BK-%06d-%03d', $book->id, $sequence),
                    'qr_token' => Str::random(64),
                    'status' => 'available',
                    'shelf_location' => $shelf,
                ]);
            }

            return $book;
        });

        ActivityLogger::log($request, 'book.created', $book, $book->only('title', 'author', 'isbn'));

        return response()->json(['data' => $book->load('copies')], 201);
    }

    public function update(Request $request, Book $book): JsonResponse
    {
        $data = $request->validate([
            'book_category_id' => ['nullable', 'exists:book_categories,id'],
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'author' => ['sometimes', 'required', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'isbn' => ['nullable', 'string', 'max:32', Rule::unique('books')->ignore($book)],
            'description' => ['nullable', 'string'],
            'cover' => ['nullable', 'image', 'max:2048'],
        ]);
        if ($request->hasFile('cover')) {
            $data['cover_path'] = $request->file('cover')->store('covers', 'public');
        }
        unset($data['cover']);

        $book->update($data);
        ActivityLogger::log($request, 'book.updated', $book, $book->only('title', 'author', 'isbn'));

        return response()->json(['data' => $book->fresh('category')]);
    }

    public function destroy(Request $request, Book $book): JsonResponse
    {
        if ($book->copies()->where('status', 'borrowed')->exists()) {
            return response()->json(['message' => 'Buku dengan eksemplar dipinjam tidak dapat dihapus.'], 422);
        }

        DB::transaction(function () use ($book): void {
            $book->copies()->delete();
            $book->delete();
        });

        ActivityLogger::log($request, 'book.deleted', $book);

        return response()->json(status: 204);
    }
}
