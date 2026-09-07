<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookCopy;
use App\Models\Loan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class LibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_login_and_read_identity(): void
    {
        $this->seed();

        $response = $this
            ->withHeader('Origin', 'http://localhost:5173')
            ->withHeader('Referer', 'http://localhost:5173/login')
            ->postJson('/api/auth/login', [
                'username' => 'admin',
                'password' => 'ChangeMeNow!',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.user.username', 'admin')
            ->assertJsonPath('data.user.email', 'admin@bmlibrary.local')
            ->assertJsonPath('data.roles.0', 'super_admin');
        $this->getJson('/api/auth/me')->assertOk();
    }

    public function test_borrow_is_atomic_and_idempotent(): void
    {
        [$admin, $member, $copy] = $this->libraryFixture();
        $payload = [
            'member_qr' => $member->member_qr_token,
            'book_qrs' => [$copy->qr_token],
            'idempotency_key' => (string) Str::uuid(),
        ];

        $this->actingAs($admin)->postJson('/api/loans/borrow', $payload)->assertCreated();
        $this->actingAs($admin)->postJson('/api/loans/borrow', $payload)->assertCreated();

        $this->assertDatabaseCount('loans', 1);
        $this->assertDatabaseHas('book_copies', ['id' => $copy->id, 'status' => 'borrowed']);
    }

    public function test_return_releases_copy_and_calculates_late_fine(): void
    {
        [$admin, $member, $copy] = $this->libraryFixture();
        $this->actingAs($admin)->postJson('/api/loans/borrow', [
            'member_qr' => $member->member_qr_token,
            'book_qrs' => [$copy->qr_token],
            'idempotency_key' => (string) Str::uuid(),
        ])->assertCreated();

        Loan::query()->update(['due_at' => now()->subDays(2)]);
        $response = $this->actingAs($admin)->postJson('/api/loans/return', [
            'book_qr' => $copy->qr_token,
            'idempotency_key' => (string) Str::uuid(),
        ]);

        $response->assertOk()->assertJsonPath('data.late_days', 2);
        $this->assertDatabaseHas('book_copies', ['id' => $copy->id, 'status' => 'available']);
        $this->assertDatabaseHas('fines', ['loan_id' => Loan::first()->id, 'amount' => 2000]);
    }

    private function libraryFixture(): array
    {
        $this->seed();
        $admin = User::where('email', 'admin@bmlibrary.local')->firstOrFail();
        $member = User::factory()->create(['status' => 'active']);
        $member->assignRole('student');
        $book = Book::create(['title' => 'Bumi Manusia', 'author' => 'Pramoedya Ananta Toer']);
        $copy = BookCopy::create([
            'book_id' => $book->id,
            'inventory_code' => 'BK-TEST-001',
            'qr_token' => Str::random(64),
            'status' => 'available',
        ]);

        return [$admin, $member, $copy];
    }
}
