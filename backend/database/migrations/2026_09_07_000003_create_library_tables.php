<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('book_categories', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('books', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('book_category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title')->index();
            $table->string('author')->index();
            $table->string('publisher')->nullable();
            $table->string('isbn', 32)->nullable()->unique();
            $table->string('cover_path')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('book_copies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('inventory_code')->unique();
            $table->string('qr_token', 64)->unique();
            $table->string('status', 20)->default('available')->index();
            $table->string('shelf_location')->nullable();
            $table->text('condition_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('loan_policies', function (Blueprint $table): void {
            $table->id();
            $table->string('member_type', 30)->unique();
            $table->unsignedSmallInteger('max_books');
            $table->unsignedSmallInteger('loan_days');
            $table->decimal('fine_per_day', 12, 2)->default(0);
            $table->decimal('fine_block_threshold', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('loans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('book_copy_id')->constrained()->restrictOnDelete();
            $table->foreignId('processed_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('returned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('active_copy_id')->nullable()->unique();
            $table->timestamp('borrowed_at');
            $table->timestamp('due_at')->index();
            $table->timestamp('returned_at')->nullable();
            $table->string('status', 20)->default('active')->index();
            $table->unsignedSmallInteger('loan_days_snapshot');
            $table->decimal('fine_per_day_snapshot', 12, 2)->default(0);
            $table->timestamps();
            $table->foreign('active_copy_id')->references('id')->on('book_copies')->restrictOnDelete();
        });

        Schema::create('fines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('loan_id')->unique()->constrained()->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->string('status', 20)->default('unpaid')->index();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('circulation_requests', function (Blueprint $table): void {
            $table->id();
            $table->uuid('idempotency_key')->unique();
            $table->string('operation', 20);
            $table->string('status', 20)->default('processing');
            $table->json('response')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('circulation_requests');
        Schema::dropIfExists('fines');
        Schema::dropIfExists('loans');
        Schema::dropIfExists('loan_policies');
        Schema::dropIfExists('book_copies');
        Schema::dropIfExists('books');
        Schema::dropIfExists('book_categories');
    }
};
