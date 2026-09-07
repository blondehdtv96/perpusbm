<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookCopy;
use App\Models\Fine;
use App\Models\Loan;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        if (! $request->user()->can('loans.view-all')) {
            $userId = $request->user()->id;

            return response()->json(['data' => [
                'active_loans' => Loan::where('user_id', $userId)->whereNotNull('active_copy_id')->count(),
                'overdue_loans' => Loan::where('user_id', $userId)->whereNotNull('active_copy_id')->where('due_at', '<', now())->count(),
                'history_count' => Loan::where('user_id', $userId)->count(),
                'unpaid_fines' => Fine::whereHas('loan', fn ($q) => $q->where('user_id', $userId))->whereIn('status', ['unpaid', 'partial'])->selectRaw('COALESCE(SUM(amount - paid_amount), 0) total')->value('total'),
                'recommendations' => Book::whereHas('copies', fn ($q) => $q->where('status', 'available'))->latest()->limit(4)->get(['id', 'title', 'author']),
            ]]);
        }

        $popular = Book::query()->select('books.id', 'books.title')->join('book_copies', 'books.id', '=', 'book_copies.book_id')
            ->join('loans', 'book_copies.id', '=', 'loans.book_copy_id')->selectRaw('COUNT(loans.id) as loans_count')->groupBy('books.id', 'books.title')
            ->orderByDesc('loans_count')->limit(5)->get()->map(fn ($book) => ['title' => $book->title, 'loans' => $book->loans_count]);
        $monthlyActivity = collect(range(5, 0))->map(function (int $monthsAgo): array {
            $month = now()->subMonths($monthsAgo);

            return ['label' => $month->translatedFormat('M Y'), 'loans' => Loan::whereBetween('borrowed_at', [$month->copy()->startOfMonth(), $month->copy()->endOfMonth()])->count()];
        });

        return response()->json(['data' => [
            'users' => User::count(), 'books' => Book::count(), 'copies' => BookCopy::count(),
            'available_copies' => BookCopy::where('status', 'available')->count(),
            'active_loans' => Loan::whereNotNull('active_copy_id')->count(),
            'overdue_loans' => Loan::whereNotNull('active_copy_id')->where('due_at', '<', now())->count(),
            'unpaid_fines' => Fine::whereIn('status', ['unpaid', 'partial'])->selectRaw('COALESCE(SUM(amount - paid_amount), 0) total')->value('total'),
            'popular_books' => $popular,
            'monthly_activity' => $monthlyActivity,
        ]]);
    }
}
