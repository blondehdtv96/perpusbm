<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Fine;
use App\Models\FinePayment;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class FineController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Fine::with(['loan.user:id,name,nis_nip', 'loan.bookCopy.book:id,title', 'payments.receiver:id,name'])
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status));
        if (! $request->user()->can('fines.view-all')) {
            $query->whereHas('loan', fn ($q) => $q->where('user_id', $request->user()->id));
        }

        return response()->json($query->latest()->paginate(min($request->integer('per_page', 20), 100)));
    }

    public function pay(Request $request, Fine $fine): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'method' => ['required', Rule::in(['cash', 'transfer', 'other'])],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $payment = DB::transaction(function () use ($fine, $data, $request): FinePayment {
            $locked = Fine::lockForUpdate()->findOrFail($fine->id);
            $remaining = (float) $locked->amount - (float) $locked->paid_amount;
            throw_if($locked->status === 'waived' || (float) $data['amount'] > $remaining,
                ValidationException::withMessages(['amount' => ['Nominal melebihi sisa denda atau denda sudah dibebaskan.']]));
            $payment = $locked->payments()->create([...$data, 'received_by' => $request->user()->id]);
            $paid = (float) $locked->paid_amount + (float) $data['amount'];
            $locked->update(['paid_amount' => $paid, 'status' => $paid >= (float) $locked->amount ? 'paid' : 'partial', 'paid_at' => $paid >= (float) $locked->amount ? now() : null]);

            return $payment;
        });
        ActivityLogger::log($request, 'fine.paid', $fine, ['amount' => $data['amount'], 'method' => $data['method']]);

        return response()->json(['message' => 'Pembayaran tercatat.', 'data' => $payment->load('fine')], 201);
    }

    public function waive(Request $request, Fine $fine): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        abort_if(in_array($fine->status, ['paid', 'waived'], true), 422, 'Denda sudah selesai.');
        $fine->update(['status' => 'waived', 'waived_by' => $request->user()->id, 'waived_at' => now(), 'waiver_reason' => $data['reason']]);
        ActivityLogger::log($request, 'fine.waived', $fine, ['reason' => $data['reason']]);

        return response()->json(['message' => 'Denda berhasil dibebaskan.', 'data' => $fine]);
    }
}
