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
        $admin = User::where('username', 'admin')->firstOrFail();
        $csv = "name,username,nis_nip,member_type,class_or_position,password\n".
            "Siswa Valid,siswa.valid,1001,student,X IPA 1,password123\n".
            "Siswa Rusak,siswa.rusak,1002,student,X IPA 1,pendek\n";

        $response = $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('anggota.csv', $csv),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()->assertJsonPath('data.success_rows', 1)->assertJsonPath('data.failed_rows', 1);
        $this->assertDatabaseHas('users', ['username' => 'siswa.valid', 'member_type' => 'student']);
        $this->assertDatabaseCount('import_failures', 1);
    }

    public function test_manual_member_validation_returns_readable_indonesian_messages(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        User::factory()->create(['username' => 'siswa.ada', 'nis_nip' => '3001', 'member_type' => 'student']);

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Siswa Baru',
            'username' => 'siswa baru',
            'password' => 'password123',
            'nis_nip' => '3001',
            'member_type' => 'student',
            'status' => 'active',
            'role' => 'student',
        ]);

        $response->assertStatus(422);
        $messages = collect($response->json('errors'))->flatten()->all();
        $this->assertNotEmpty($messages);
        foreach ($messages as $message) {
            $this->assertStringNotContainsString('validation.', $message, 'Pesan validasi harus diterjemahkan, bukan kunci mentah.');
        }
        $this->assertStringContainsString('Username hanya boleh berisi', $response->json('errors.username.0'));
        $this->assertStringContainsString('NIS/NIP ini sudah dipakai', $response->json('errors.nis_nip.0'));
    }

    public function test_adding_member_reuses_account_that_was_deleted_before(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $deleted = User::factory()->create(['name' => 'Nama Lama', 'username' => 'siswa.lama', 'nis_nip' => '4001', 'member_type' => 'student']);
        $deleted->assignRole('student');
        $deleted->delete();

        $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Nama Baru',
            'username' => 'siswa.baru',
            'password' => 'password123',
            'nis_nip' => '4001',
            'member_type' => 'student',
            'class_or_position' => 'XI IPA 1',
            'status' => 'active',
            'role' => 'student',
        ])->assertCreated()->assertJsonPath('data.id', $deleted->id);

        $this->assertDatabaseHas('users', [
            'id' => $deleted->id,
            'username' => 'siswa.baru',
            'nis_nip' => '4001',
            'name' => 'Nama Baru',
            'status' => 'active',
            'deleted_at' => null,
        ]);
        $this->assertSame(1, User::withTrashed()->where('nis_nip', '4001')->count());
    }

    public function test_conflict_with_deleted_account_is_explained_instead_of_generic_unique_error(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $deleted = User::factory()->create(['name' => 'Anggota Arsip', 'username' => 'siswa.arsip', 'nis_nip' => '5001', 'member_type' => 'student']);
        $deleted->delete();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Siswa Lain',
            'username' => 'siswa.arsip',
            'password' => 'password123',
            'nis_nip' => '5002',
            'member_type' => 'student',
            'status' => 'active',
            'role' => 'student',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('anggota terhapus "Anggota Arsip"', $response->json('errors.username.0'));
        $this->assertDatabaseMissing('users', ['nis_nip' => '5002']);
    }

    public function test_nis_nip_zero_is_treated_as_empty_and_skips_unique_validation(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();

        foreach ([['siswa.nol1', '0'], ['siswa.nol2', 0], ['siswa.nol3', '00']] as [$username, $nisNip]) {
            $this->actingAs($admin)->postJson('/api/users', [
                'name' => 'Siswa Tanpa NIS',
                'username' => $username,
                'password' => 'password123',
                'nis_nip' => $nisNip,
                'member_type' => 'student',
                'status' => 'active',
                'role' => 'student',
            ])->assertCreated()->assertJsonPath('data.nis_nip', null);
            $this->assertDatabaseHas('users', ['username' => $username, 'nis_nip' => null]);
        }

        $csv = "name,username,nis_nip,member_type,class_or_position,password\n".
            "Siswa Nol A,siswa.nol.csv1,0,student,X IPA 1,password123\n".
            "Siswa Nol B,siswa.nol.csv2,0,student,X IPA 1,password123\n";

        $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('anggota.csv', $csv),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.failed_rows', 0)
            ->assertJsonPath('data.success_rows', 2);
        $this->assertDatabaseHas('users', ['username' => 'siswa.nol.csv1', 'nis_nip' => null]);
        $this->assertDatabaseHas('users', ['username' => 'siswa.nol.csv2', 'nis_nip' => null]);
    }

    public function test_import_never_fails_rows_because_of_duplicate_username_or_nis(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $existing = User::factory()->create(['name' => 'Nama Lama', 'username' => 'siswa.lama', 'nis_nip' => '2001', 'member_type' => 'student']);
        $existing->assignRole('student');
        $deleted = User::factory()->create(['username' => 'siswa.hapus', 'nis_nip' => '2002', 'member_type' => 'student']);
        $deleted->assignRole('student');
        $deleted->delete();

        $csv = "name,username,nis_nip,member_type,class_or_position,password\n".
            "Nama Baru,siswa.lama,2001,student,XII IPA 2,password123\n".      // sudah ada: diperbarui
            "Siswa Kembali,siswa.hapus,2002,student,XI IPS 1,password123\n".  // pernah dihapus: dipulihkan
            "Siswa Bentrok,siswa.lama,2003,student,X IPA 1,password123\n".    // username dipakai orang lain: diberi akhiran
            "Siswa Admin,admin,2004,staff,Pustakawan,password123\n";          // bentrok akun petugas: dibuat terpisah

        $response = $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('anggota.csv', $csv),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('data.failed_rows', 0)
            ->assertJsonPath('data.success_rows', 2)
            ->assertJsonPath('data.updated_rows', 2);
        $this->assertDatabaseCount('import_failures', 0);
        $this->assertDatabaseHas('users', ['username' => 'siswa.lama', 'nis_nip' => '2001', 'name' => 'Nama Baru', 'class_or_position' => 'XII IPA 2']);
        $this->assertDatabaseHas('users', ['username' => 'siswa.hapus', 'nis_nip' => '2002', 'status' => 'active', 'deleted_at' => null]);
        $this->assertDatabaseHas('users', ['username' => 'siswa.lama2', 'nis_nip' => '2003']);
        $this->assertDatabaseHas('users', ['username' => 'admin2', 'name' => 'Siswa Admin']);
        $this->assertTrue(User::where('username', 'admin')->firstOrFail()->hasRole('super_admin'));
        $this->assertTrue($existing->fresh()->password === $existing->password, 'Password anggota lama tidak boleh berubah saat import.');
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
        $admin = User::where('username', 'admin')->firstOrFail();
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
