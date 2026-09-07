<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('username', 100)->nullable()->unique()->after('name');
        });

        DB::table('users')->orderBy('id')->each(function (object $user): void {
            $source = $user->nis_nip ?: Str::before($user->email, '@');
            $base = Str::lower((string) preg_replace('/[^a-zA-Z0-9._-]/', '', Str::slug($source, '_')));
            $base = $base !== '' ? $base : "user{$user->id}";
            $username = $base;
            $suffix = 1;
            while (DB::table('users')->where('username', $username)->exists()) {
                $username = "{$base}_{$suffix}";
                $suffix++;
            }
            DB::table('users')->where('id', $user->id)->update(['username' => $username]);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['username']);
            $table->dropColumn('username');
        });
    }
};
