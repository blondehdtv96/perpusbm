<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ImportFailure;
use App\Models\ImportJob;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class UserImportController extends Controller
{
    private const HEADERS = ['name', 'username', 'nis_nip', 'member_type', 'class_or_position', 'password'];

    public function store(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt,xlsx,xls', 'max:5120']]);
        $file = $request->file('file');
        $job = ImportJob::create(['user_id' => $request->user()->id, 'filename' => $file->getClientOriginalName()]);
        $spreadsheet = null;

        try {
            $spreadsheet = IOFactory::load($file->getRealPath());
            $sheet = $spreadsheet->getSheetByName('Data Anggota') ?? $spreadsheet->getActiveSheet();
            $rows = $sheet->toArray(null, true, true, false);
            $headers = array_map(
                fn ($value) => str((string) $value)->replace("\xEF\xBB\xBF", '')->trim()->lower()->replace(' ', '_')->toString(),
                array_shift($rows) ?? [],
            );
            if ($headers !== self::HEADERS) {
                throw ValidationException::withMessages([
                    'file' => ['Header template tidak valid. Unduh template terbaru dan jangan mengubah nama atau urutan kolom. Header wajib: '.implode(', ', self::HEADERS).'.'],
                ]);
            }

            $success = 0;
            $failed = 0;
            $processed = 0;

            foreach ($rows as $offset => $values) {
                if (! array_filter($values, fn ($value) => $value !== null && $value !== '')) {
                    continue;
                }

                $processed++;
                $row = array_combine($headers, array_slice(array_pad($values, count($headers), null), 0, count($headers)));
                $row = array_map(fn ($value) => $value === null || $value === '' ? null : trim((string) $value), $row);
                $validator = Validator::make($row, [
                    'name' => ['required', 'string', 'max:255'],
                    'username' => ['required', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', 'unique:users,username'],
                    'nis_nip' => ['nullable', 'string', 'max:100', 'unique:users,nis_nip'],
                    'member_type' => ['required', 'in:student,staff'],
                    'class_or_position' => ['nullable', 'string', 'max:255'],
                    'password' => ['required', 'string', 'min:8'],
                ], [
                    'member_type.in' => 'Tipe anggota harus student atau staff.',
                    'password.required' => 'Password awal wajib diisi.',
                    'password.min' => 'Password awal minimal 8 karakter.',
                ]);

                if ($validator->fails()) {
                    $safeRow = $row;
                    $safeRow['password'] = '[DISEMBUNYIKAN]';
                    ImportFailure::create([
                        'import_job_id' => $job->id,
                        'row_number' => $offset + 2,
                        'row_data' => $safeRow,
                        'errors' => $validator->errors()->toArray(),
                    ]);
                    $failed++;

                    continue;
                }

                $data = $validator->validated();
                $password = $data['password'];
                unset($data['password']);
                DB::transaction(function () use ($data, $password): void {
                    $user = User::create([...$data, 'password' => Hash::make($password), 'status' => 'active']);
                    $user->assignRole($data['member_type']);
                });
                $success++;
            }

            $job->update(['status' => 'completed', 'total_rows' => $processed, 'success_rows' => $success, 'failed_rows' => $failed]);
            ActivityLogger::log($request, 'users.imported', $job, ['success' => $success, 'failed' => $failed]);

            return response()->json(['data' => $job->fresh('failures')], 201);
        } catch (Throwable $exception) {
            $job->update(['status' => 'failed']);
            throw $exception;
        } finally {
            $spreadsheet?->disconnectWorksheets();
        }
    }

    public function template(): StreamedResponse
    {
        return response()->streamDownload(function (): void {
            $spreadsheet = new Spreadsheet;
            $dataSheet = $spreadsheet->getActiveSheet();
            $dataSheet->setTitle('Data Anggota');
            $dataSheet->fromArray(self::HEADERS, null, 'A1');
            $dataSheet->freezePane('A2');
            $dataSheet->setAutoFilter('A1:F1000');
            $dataSheet->getStyle('A1:F1')->applyFromArray([
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1D4ED8']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
            ]);
            $dataSheet->getStyle('A1:F1000')->getAlignment()->setVertical(Alignment::VERTICAL_CENTER);
            $dataSheet->getStyle('B2:C1000')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            $dataSheet->getStyle('F2:F1000')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            foreach (['A' => 26, 'B' => 20, 'C' => 18, 'D' => 18, 'E' => 26, 'F' => 22] as $column => $width) {
                $dataSheet->getColumnDimension($column)->setWidth($width);
            }
            for ($row = 2; $row <= 1000; $row++) {
                $validation = $dataSheet->getCell("D{$row}")->getDataValidation();
                $validation->setType(DataValidation::TYPE_LIST)
                    ->setErrorStyle(DataValidation::STYLE_STOP)
                    ->setAllowBlank(false)
                    ->setShowDropDown(true)
                    ->setShowErrorMessage(true)
                    ->setErrorTitle('Tipe tidak valid')
                    ->setError('Pilih student atau staff dari daftar.')
                    ->setFormula1('"student,staff"');
            }

            $guide = $spreadsheet->createSheet();
            $guide->setTitle('Petunjuk');
            $guide->fromArray([
                ['PANDUAN IMPORT ANGGOTA BM LIBRARY', ''],
                ['Langkah', 'Keterangan'],
                ['1', 'Isi data hanya pada sheet Data Anggota mulai baris 2.'],
                ['2', 'Jangan mengubah nama, urutan, atau jumlah kolom header.'],
                ['3', 'Enam kolom: name, username, nis_nip, member_type, class_or_position, password.'],
                ['4', 'Kolom wajib: name, username, member_type, dan password.'],
                ['5', 'member_type dipilih dari dropdown: student atau staff.'],
                ['6', 'Password awal minimal 8 karakter. Gunakan password unik dan aman.'],
                ['7', 'Username, NIS/NIP, dan password diformat sebagai teks agar format asli dipertahankan.'],
                ['8', 'Sheet Contoh hanya panduan dan tidak akan diimpor.'],
                ['', 'Simpan sebagai XLSX, lalu unggah melalui halaman Anggota. Maksimal 5 MB.'],
            ], null, 'A1');
            $guide->mergeCells('A1:B1');
            $guide->getStyle('A1:B1')->applyFromArray([
                'font' => ['bold' => true, 'size' => 16, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1E3A8A']],
                'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
            ]);
            $guide->getStyle('A2:B2')->getFont()->setBold(true);
            $guide->getColumnDimension('A')->setWidth(14);
            $guide->getColumnDimension('B')->setWidth(95);
            $guide->getStyle('A1:B11')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
            $guide->freezePane('A3');

            $example = $spreadsheet->createSheet();
            $example->setTitle('Contoh');
            $example->fromArray([
                self::HEADERS,
                ['Budi Santoso', 'budi.santoso', '20260001', 'student', 'XII IPA 1', 'Budi#2026'],
                ['Siti Aminah', 'siti.aminah', '19876543', 'staff', 'Pustakawan', 'Siti#2026'],
            ], null, 'A1');
            $example->getStyle('A1:F1')->applyFromArray([
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '1E3A8A']],
            ]);
            foreach (range('A', 'F') as $column) {
                $example->getColumnDimension($column)->setAutoSize(true);
            }
            $example->getStyle('B2:C3')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            $example->getStyle('F2:F3')->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);

            $spreadsheet->setActiveSheetIndex(0);
            (new Xlsx($spreadsheet))->save('php://output');
            $spreadsheet->disconnectWorksheets();
        }, 'template-import-anggota.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function show(ImportJob $importJob): JsonResponse
    {
        return response()->json(['data' => $importJob->load('failures')]);
    }
}
