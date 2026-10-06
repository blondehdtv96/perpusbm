<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jenis kelamin melengkapi data anggota yang sudah ada (kontak, foto, nomor anggota) sehingga
     * form tambah anggota, kartu perpustakaan, dan laporan memakai satu sumber data yang sama.
     * Nilainya "L" atau "P" dan boleh kosong supaya anggota lama tetap sah tanpa pengisian ulang.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('gender', 1)->nullable()->after('member_type');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('gender');
        });
    }
};
