<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Anggota siswa kini selalu ditempatkan pada kelas lewat form tambah anggota maupun import,
     * sedangkan NIS-nya boleh belum tersedia. NIS siswa dibuat nullable agar penempatan kelas
     * tetap bisa dicatat tanpa memaksa petugas mengarang NIS sementara.
     */
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->string('nis', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->string('nis', 100)->nullable(false)->change();
        });
    }
};
