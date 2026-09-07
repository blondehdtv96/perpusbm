<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookCopy;
use App\Services\ActivityLogger;
use App\Services\QrCodeService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class BookCopyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $copies = BookCopy::with('book:id,title,author')
            ->when($request->integer('book_id'), fn ($q, $id) => $q->where('book_id', $id))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->string('search')->toString(), fn ($q, $search) => $q->where('inventory_code', 'like', "%{$search}%"))
            ->latest()->paginate(min($request->integer('per_page', 20), 100));

        return response()->json($copies);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'book_id' => ['required', 'exists:books,id'],
            'inventory_code' => ['required', 'string', 'max:100', 'unique:book_copies,inventory_code'],
            'shelf_location' => ['nullable', 'string', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
        ]);
        $copy = BookCopy::create([...$data, 'qr_token' => Str::random(64), 'status' => 'available']);
        ActivityLogger::log($request, 'copy.created', $copy, $copy->only('inventory_code', 'shelf_location'));

        return response()->json(['data' => $copy->load('book:id,title')], 201);
    }

    public function update(Request $request, BookCopy $bookCopy): JsonResponse
    {
        $data = $request->validate([
            'inventory_code' => ['sometimes', 'string', 'max:100', Rule::unique('book_copies')->ignore($bookCopy)],
            'status' => ['sometimes', Rule::in(['available', 'maintenance', 'lost'])],
            'shelf_location' => ['nullable', 'string', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
        ]);
        abort_if($bookCopy->status === 'borrowed' && isset($data['status']), 422, 'Status eksemplar dipinjam hanya berubah melalui pengembalian.');
        $bookCopy->update($data);
        ActivityLogger::log($request, 'copy.updated', $bookCopy, $data);

        return response()->json(['data' => $bookCopy->fresh('book:id,title')]);
    }

    public function destroy(Request $request, BookCopy $bookCopy): JsonResponse
    {
        abort_if($bookCopy->status === 'borrowed' || $bookCopy->loans()->whereNotNull('active_copy_id')->exists(), 422, 'Eksemplar sedang dipinjam.');
        $bookCopy->delete();
        ActivityLogger::log($request, 'copy.deleted', $bookCopy);

        return response()->json(status: 204);
    }

    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:100']]);
        $copy = BookCopy::with('book:id,title,author')->where('qr_token', $data['code'])->orWhere('inventory_code', $data['code'])->first();
        abort_if(! $copy, 404, 'Eksemplar tidak ditemukan.');

        return response()->json(['data' => $copy]);
    }

    public function labels(Request $request, QrCodeService $qr): Response
    {
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:100'], 'ids.*' => ['integer', 'exists:book_copies,id']]);
        $copies = BookCopy::with('book:id,title')->whereIn('id', $data['ids'])->get();
        $copies->each(fn (BookCopy $copy) => $copy->setAttribute('qr_image', $qr->dataUri($copy->qr_token, 180)));
        ActivityLogger::log($request, 'copies.labels_exported', null, ['count' => $copies->count()]);

        return Pdf::loadView('pdf.labels', compact('copies'))->setPaper('a4')->download('label-buku.pdf');
    }
}
