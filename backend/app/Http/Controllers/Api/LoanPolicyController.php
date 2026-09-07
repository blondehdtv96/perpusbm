<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LoanPolicy;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoanPolicyController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => LoanPolicy::orderBy('member_type')->get()]);
    }

    public function update(Request $request, LoanPolicy $loanPolicy): JsonResponse
    {
        $data = $request->validate([
            'max_books' => ['required', 'integer', 'min:1', 'max:100'],
            'loan_days' => ['required', 'integer', 'min:1', 'max:365'],
            'fine_per_day' => ['required', 'numeric', 'min:0'],
            'fine_block_threshold' => ['required', 'numeric', 'min:0'],
        ]);
        $loanPolicy->update($data);
        ActivityLogger::log($request, 'policy.updated', $loanPolicy, $data);

        return response()->json(['data' => $loanPolicy]);
    }
}
