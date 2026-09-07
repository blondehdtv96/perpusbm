<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookCopy;
use App\Models\Fine;
use App\Models\Loan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Tests\TestCase;

class MvpModulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_cannot_access_user_management(): void
    {
        $this->seed();
        $member = User::factory()->create(['member_type' => 'student']);
        $member->assignRole('student');

        $this->actingAs($member)->getJson('/api/users')->assertForbidden();
    }

    public function test_csv_import_reports_success_and_invalid_rows(): void
    {
        $this->seed();
        $admin = User::where('email', 'admin@bmlibrary.local')->firstOrFail();
        $csv = "name,username,email,nis_nip,member_type,class_or_position,phone,password\n".
            "Siswa Valid,siswa.valid,valid@example.com,1001,student,X IPA 1,0812,password123\n".
            "Siswa Rusak,siswa.rusak,bukan-email,1002,student,X IPA 1,0813,password123\n";

        $response = $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('anggota.csv', $csv),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()->assertJsonPath('data.success_rows', 1)->assertJsonPath('data.failed_rows', 1);
        $this->assertDatabaseHas('users', ['username' => 'siswa.valid', 'email' => 'valid@example.com', 'member_type' => 'student']);
        $this->assertDatabaseCount('import_failures', 1);
    }

    public function test_inventory_codes_work_and_payment_keeps_a_ledger(): void
    {
        [$admin, $member, $copy] = $this->fixture();
        $this->actingAs($admin)->postJson('/api/loans/borrow', [
            'member_code' => $member->nis_nip,
            'book_codes' => [$copy->inventory_code],
            'idempotency_key' => (string) Str::uuid(),
        ])->assertCreated();
        Loan::query()->update(['due_at' => now()->subDay()]);
        $this->actingAs($admin)->postJson('/api/loans/return', [
            'book_code' => $copy->inventory_code,
            'idempotency_key' => (string) Str::uuid(),
        ])->assertOk();

        $fine = Fine::firstOrFail();
        $this->actingAs($admin)->postJson("/api/fines/{$fine->id}/payments", [
            'amount' => $fine->amount,
            'method' => 'cash',
        ])->assertCreated();
        $this->assertDatabaseHas('fines', ['id' => $fine->id, 'status' => 'paid']);
        $this->assertDatabaseHas('fine_payments', ['fine_id' => $fine->id, 'received_by' => $admin->id]);
        $this->assertDatabaseHas('activity_logs', ['action' => 'loan.borrowed']);
    }

    public function test_report_and_qr_label_exports_are_downloadable(): void
    {
        [$admin, , $copy] = $this->fixture();
        $this->actingAs($admin)->get('/api/reports/export?type=inventory&format=csv')
            ->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $this->actingAs($admin)->get('/api/reports/export?type=inventory&format=xlsx')
            ->assertOk()->assertDownload();
        $this->actingAs($admin)->postJson('/api/book-copies/labels', ['ids' => [$copy->id]])
            ->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    private function fixture(): array
    {
        $this->seed();
        $admin = User::where('email', 'admin@bmlibrary.local')->firstOrFail();
        $member = User::factory()->create(['status' => 'active', 'member_type' => 'student', 'nis_nip' => 'MEMBER-001']);
        $member->assignRole('student');
        $book = Book::create(['title' => 'Laskar Pelangi', 'author' => 'Andrea Hirata']);
        $copy = BookCopy::create([
            'book_id' => $book->id,
            'inventory_code' => 'INV-001',
            'qr_token' => Str::random(64),
            'status' => 'available',
        ]);

        return [$admin, $member, $copy];
    }
}
