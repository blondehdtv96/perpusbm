<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookCopy;
use App\Models\CirculationRequest;
use App\Models\Fine;
use App\Models\Loan;
use App\Models\LoanPolicy;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CirculationController extends Controller
{
    public function borrow(Request $request): JsonResponse
    {
        $data = $request->validate([
            'member_qr' => ['nullable', 'string', 'max:100', 'required_without:member_code'],
            'member_code' => ['nullable', 'string', 'max:100', 'required_without:member_qr'],
            'book_qrs' => ['nullable', 'array', 'min:1', 'max:20', 'required_without:book_codes'],
            'book_qrs.*' => ['required', 'string', 'max:100', 'distinct'],
            'book_codes' => ['nullable', 'array', 'min:1', 'max:20', 'required_without:book_qrs'],
            'book_codes.*' => ['required', 'string', 'max:100', 'distinct'],
            'idempotency_key' => ['required', 'uuid'],
        ]);
        $memberCode = $data['member_code'] ?? $data['member_qr'];
        $bookCodes = $data['book_codes'] ?? $data['book_qrs'];
        $requestHash = hash('sha256', json_encode([$memberCode, $bookCodes]));

        $result = DB::transaction(function () use ($data, $request, $memberCode, $bookCodes, $requestHash): array {
            $idempotency = CirculationRequest::firstOrCreate(
                ['idempotency_key' => $data['idempotency_key']],
                ['operation' => 'borrow', 'request_hash' => $requestHash, 'status' => 'processing', 'expires_at' => now()->addDay()],
            );

            if (! $idempotency->wasRecentlyCreated) {
                $this->ensureReusableRequest($idempotency, 'borrow', $requestHash);

                return $idempotency->response;
            }

            $member = User::where(function ($query) use ($memberCode): void {
                $query->where('member_qr_token', $memberCode)->orWhere('nis_nip', $memberCode);
            })->where('status', 'active')->lockForUpdate()->first();
            throw_if(! $member, ValidationException::withMessages(['member_qr' => ['Anggota tidak ditemukan atau tidak aktif.']]));

            $memberType = $member->member_type;
            $policy = LoanPolicy::where('member_type', $memberType)->firstOrFail();
            $activeCount = Loan::where('user_id', $member->id)->whereNotNull('active_copy_id')->count();
            $requestedCount = count($bookCodes);

            throw_if($activeCount + $requestedCount > $policy->max_books,
                ValidationException::withMessages(['book_qrs' => ['Jumlah buku melebihi batas pinjaman anggota.']]));
            throw_if(Loan::where('user_id', $member->id)->whereNotNull('active_copy_id')->where('due_at', '<', now())->exists(),
                ValidationException::withMessages(['member_qr' => ['Anggota memiliki pinjaman terlambat.']]));

            $outstandingFine = Fine::whereHas('loan', fn ($q) => $q->where('user_id', $member->id))
                ->whereIn('status', ['unpaid', 'partial'])->selectRaw('COALESCE(SUM(amount - paid_amount), 0) total')->value('total');
            throw_if((float) $policy->fine_block_threshold > 0 && (float) $outstandingFine >= (float) $policy->fine_block_threshold,
                ValidationException::withMessages(['member_code' => ['Anggota diblokir karena denda belum lunas.']]));

            $copies = BookCopy::with('book:id,title')
                ->where(function ($query) use ($bookCodes): void {
                    $query->whereIn('qr_token', $bookCodes)->orWhereIn('inventory_code', $bookCodes);
                })->lockForUpdate()->get();
            throw_if($copies->count() !== $requestedCount,
                ValidationException::withMessages(['book_qrs' => ['Satu atau lebih QR buku tidak ditemukan.']]));
            throw_if($copies->contains(fn (BookCopy $copy) => $copy->status !== 'available'),
                ValidationException::withMessages(['book_qrs' => ['Satu atau lebih eksemplar tidak tersedia.']]));

            $borrowedAt = now();
            $dueAt = $borrowedAt->copy()->addDays($policy->loan_days);
            $loans = [];

            foreach ($copies as $copy) {
                $loan = Loan::create([
                    'user_id' => $member->id,
                    'book_copy_id' => $copy->id,
                    'processed_by' => $request->user()->id,
                    'active_copy_id' => $copy->id,
                    'borrowed_at' => $borrowedAt,
                    'due_at' => $dueAt,
                    'status' => 'active',
                    'loan_days_snapshot' => $policy->loan_days,
                    'fine_per_day_snapshot' => $policy->fine_per_day,
                ]);
                $copy->update(['status' => 'borrowed']);
                $loans[] = ['id' => $loan->id, 'book' => $copy->book->title, 'inventory_code' => $copy->inventory_code];
            }

            $response = [
                'message' => 'Peminjaman berhasil.',
                'data' => ['member' => $member->only('id', 'name', 'nis_nip'), 'due_at' => $dueAt->toISOString(), 'loans' => $loans],
            ];
            $idempotency->update(['status' => 'completed', 'response' => $response]);

            return $response;
        }, 3);

        ActivityLogger::log($request, 'loan.borrowed', null, ['member_id' => $result['data']['member']['id'], 'loan_ids' => array_column($result['data']['loans'], 'id')]);

        return response()->json($result, 201);
    }

    public function returnBook(Request $request): JsonResponse
    {
        $data = $request->validate([
            'book_qr' => ['nullable', 'string', 'max:100', 'required_without:book_code'],
            'book_code' => ['nullable', 'string', 'max:100', 'required_without:book_qr'],
            'idempotency_key' => ['required', 'uuid'],
        ]);
        $bookCode = $data['book_code'] ?? $data['book_qr'];
        $requestHash = hash('sha256', $bookCode);

        $result = DB::transaction(function () use ($data, $request, $bookCode, $requestHash): array {
            $idempotency = CirculationRequest::firstOrCreate(
                ['idempotency_key' => $data['idempotency_key']],
                ['operation' => 'return', 'request_hash' => $requestHash, 'status' => 'processing', 'expires_at' => now()->addDay()],
            );

            if (! $idempotency->wasRecentlyCreated) {
                $this->ensureReusableRequest($idempotency, 'return', $requestHash);

                return $idempotency->response;
            }

            $copy = BookCopy::with('book:id,title')->where(function ($query) use ($bookCode): void {
                $query->where('qr_token', $bookCode)->orWhere('inventory_code', $bookCode);
            })->lockForUpdate()->first();
            throw_if(! $copy, ValidationException::withMessages(['book_qr' => ['QR buku tidak ditemukan.']]));

            $loan = Loan::where('active_copy_id', $copy->id)->lockForUpdate()->first();
            throw_if(! $loan, ValidationException::withMessages(['book_qr' => ['Eksemplar ini tidak memiliki pinjaman aktif.']]));

            $returnedAt = now();
            $lateDays = $returnedAt->greaterThan($loan->due_at)
                ? (int) ceil(($returnedAt->getTimestamp() - $loan->due_at->getTimestamp()) / 86400)
                : 0;
            $fineAmount = round($lateDays * (float) $loan->fine_per_day_snapshot, 2);

            $loan->update([
                'returned_by' => $request->user()->id,
                'active_copy_id' => null,
                'returned_at' => $returnedAt,
                'status' => 'returned',
            ]);
            $copy->update(['status' => 'available']);

            if ($fineAmount > 0) {
                Fine::create(['loan_id' => $loan->id, 'amount' => $fineAmount, 'status' => 'unpaid']);
            }

            $response = [
                'message' => 'Pengembalian berhasil.',
                'data' => [
                    'loan_id' => $loan->id,
                    'book' => $copy->book->title,
                    'inventory_code' => $copy->inventory_code,
                    'late_days' => $lateDays,
                    'fine_amount' => $fineAmount,
                ],
            ];
            $idempotency->update(['status' => 'completed', 'response' => $response]);

            return $response;
        }, 3);

        ActivityLogger::log($request, 'loan.returned', null, $result['data']);

        return response()->json($result);
    }

    public function active(Request $request): JsonResponse
    {
        $query = Loan::query()
            ->with(['user:id,name,nis_nip', 'bookCopy.book:id,title', 'fine'])
            ->whereNotNull('active_copy_id');

        if (! $request->user()->can('loans.view-all')) {
            $query->where('user_id', $request->user()->id);
        }

        return response()->json($query->latest('borrowed_at')->paginate(20));
    }

    public function history(Request $request): JsonResponse
    {
        $query = Loan::query()->with(['user:id,name,nis_nip', 'bookCopy.book:id,title', 'fine'])->whereNull('active_copy_id');
        if (! $request->user()->can('loans.view-all')) {
            $query->where('user_id', $request->user()->id);
        }

        return response()->json($query->latest('borrowed_at')->paginate(min($request->integer('per_page', 20), 100)));
    }

    private function ensureReusableRequest(CirculationRequest $request, string $operation, string $requestHash): void
    {
        throw_if($request->operation !== $operation || ($request->request_hash && $request->request_hash !== $requestHash),
            ValidationException::withMessages(['idempotency_key' => ['Kunci sudah digunakan untuk request berbeda.']]));
        throw_if($request->status !== 'completed' || ! $request->response,
            ValidationException::withMessages(['idempotency_key' => ['Transaksi dengan kunci ini masih diproses.']]));
    }
}
