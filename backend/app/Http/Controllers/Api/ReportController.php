<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookCopy;
use App\Models\Fine;
use App\Models\Loan;
use App\Services\ActivityLogger;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\Response;

class ReportController extends Controller
{
    public function export(Request $request): Response
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['circulation', 'fines', 'inventory'])],
            'format' => ['required', Rule::in(['csv', 'xlsx', 'pdf'])],
            'from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);
        [$headers, $rows] = $this->dataset($data['type'], $data['from'] ?? null, $data['to'] ?? null);
        ActivityLogger::log($request, 'report.exported', null, ['type' => $data['type'], 'format' => $data['format'], 'rows' => count($rows)]);
        $filename = "laporan-{$data['type']}-".now()->format('Ymd-His');

        if ($data['format'] === 'csv') {
            return response()->streamDownload(function () use ($headers, $rows): void {
                $output = fopen('php://output', 'wb');
                fputcsv($output, $headers);
                foreach ($rows as $row) {
                    fputcsv($output, $row);
                }
                fclose($output);
            }, "{$filename}.csv", ['Content-Type' => 'text/csv']);
        }

        if ($data['format'] === 'xlsx') {
            $spreadsheet = new Spreadsheet;
            $sheet = $spreadsheet->getActiveSheet();
            $sheet->fromArray([$headers, ...$rows]);
            $path = storage_path("app/{$filename}.xlsx");
            (new Xlsx($spreadsheet))->save($path);

            return response()->download($path, "{$filename}.xlsx")->deleteFileAfterSend();
        }

        return Pdf::loadView('pdf.report', ['title' => "Laporan {$data['type']}", 'headers' => $headers, 'rows' => $rows])->setPaper('a4', 'landscape')->download("{$filename}.pdf");
    }

    private function dataset(string $type, ?string $from, ?string $to): array
    {
        if ($type === 'inventory') {
            $query = BookCopy::with('book:id,title,author,isbn');
            if ($from) {
                $query->whereDate('created_at', '>=', $from);
            }
            if ($to) {
                $query->whereDate('created_at', '<=', $to);
            }

            return [['Kode', 'Judul', 'Penulis', 'ISBN', 'Status', 'Rak'], $query->get()->map(fn ($copy) => [
                $copy->inventory_code, $copy->book->title, $copy->book->author, $copy->book->isbn,
                $copy->status, $copy->shelf_location,
            ])->all()];
        }

        if ($type === 'fines') {
            $query = Fine::with(['loan.user:id,name,nis_nip', 'loan.bookCopy.book:id,title']);
            if ($from) {
                $query->whereDate('created_at', '>=', $from);
            }
            if ($to) {
                $query->whereDate('created_at', '<=', $to);
            }

            return [['Anggota', 'NIS/NIP', 'Buku', 'Denda', 'Dibayar', 'Status', 'Tanggal'], $query->get()->map(fn ($fine) => [
                $fine->loan->user->name, $fine->loan->user->nis_nip, $fine->loan->bookCopy->book->title,
                $fine->amount, $fine->paid_amount, $fine->status, $fine->created_at->format('d/m/Y'),
            ])->all()];
        }

        $query = Loan::with(['user:id,name,nis_nip', 'bookCopy.book:id,title']);
        if ($from) {
            $query->whereDate('borrowed_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('borrowed_at', '<=', $to);
        }

        return [['Anggota', 'NIS/NIP', 'Buku', 'Kode', 'Dipinjam', 'Jatuh Tempo', 'Kembali', 'Status'], $query->get()->map(fn ($loan) => [
            $loan->user->name, $loan->user->nis_nip, $loan->bookCopy->book->title, $loan->bookCopy->inventory_code,
            $loan->borrowed_at->format('d/m/Y H:i'), $loan->due_at->format('d/m/Y H:i'),
            $loan->returned_at?->format('d/m/Y H:i'), $loan->status,
        ])->all()];
    }
}
