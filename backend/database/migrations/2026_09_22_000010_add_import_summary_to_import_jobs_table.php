<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('import_jobs', function (Blueprint $table): void {
            $table->unsignedInteger('updated_rows')->default(0)->after('success_rows');
            $table->json('notes')->nullable()->after('failed_rows');
        });
    }

    public function down(): void
    {
        Schema::table('import_jobs', function (Blueprint $table): void {
            $table->dropColumn(['updated_rows', 'notes']);
        });
    }
};
