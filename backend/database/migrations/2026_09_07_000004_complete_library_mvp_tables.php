<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('member_type', 30)->default('student')->after('nis_nip')->index();
        });

        Schema::table('loans', function (Blueprint $table): void {
            $table->timestamp('due_reminded_at')->nullable()->after('returned_at');
        });

        Schema::table('fines', function (Blueprint $table): void {
            $table->foreignId('waived_by')->nullable()->after('paid_at')->constrained('users')->nullOnDelete();
            $table->timestamp('waived_at')->nullable()->after('waived_by');
            $table->string('waiver_reason')->nullable()->after('waived_at');
        });

        Schema::table('circulation_requests', function (Blueprint $table): void {
            $table->string('request_hash', 64)->nullable()->after('operation');
            $table->timestamp('expires_at')->nullable()->after('response')->index();
        });

        Schema::create('fine_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('fine_id')->constrained()->restrictOnDelete();
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('method', 30)->default('cash');
            $table->string('reference')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('import_jobs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('filename');
            $table->string('status', 20)->default('processing');
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('success_rows')->default(0);
            $table->unsignedInteger('failed_rows')->default(0);
            $table->timestamps();
        });

        Schema::create('import_failures', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('import_job_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('row_number');
            $table->json('row_data');
            $table->json('errors');
        });

        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 100)->index();
            $table->string('subject_type')->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->text('description')->nullable();
            $table->json('changes')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('created_at')->index();
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('import_failures');
        Schema::dropIfExists('import_jobs');
        Schema::dropIfExists('fine_payments');

        Schema::table('circulation_requests', function (Blueprint $table): void {
            $table->dropColumn(['request_hash', 'expires_at']);
        });
        Schema::table('fines', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('waived_by');
            $table->dropColumn(['waived_at', 'waiver_reason']);
        });
        Schema::table('loans', fn (Blueprint $table) => $table->dropColumn('due_reminded_at'));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('member_type'));
    }
};
