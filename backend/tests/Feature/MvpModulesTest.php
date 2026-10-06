<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookCopy;
use App\Models\ClassGroup;
use App\Models\Fine;
use App\Models\Loan;
use App\Models\Major;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class MvpModulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_stats_match_database_and_ignore_list_filters(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        User::factory()->count(3)->create(['member_type' => 'student', 'status' => 'active']);
        User::factory()->create(['member_type' => 'staff', 'status' => 'suspended']);
        User::factory()->create(['member_type' => 'student', 'status' => 'active'])->delete();

        $response = $this->actingAs($admin)->getJson('/api/users/stats')->assertOk();

        $response->assertJsonPath('data.total', User::count())
            ->assertJsonPath('data.students', User::where('member_type', 'student')->count())
            ->assertJsonPath('data.staff', User::where('member_type', 'staff')->count())
            ->assertJsonPath('data.active', User::where('status', 'active')->count())
            ->assertJsonPath('data.suspended', User::where('status', 'suspended')->count())
            ->assertJsonPath('data.inactive', User::where('status', 'inactive')->count())
            ->assertJsonPath('data.archived', 1);

        // Anggota terhapus tidak dihitung, dan filter pada daftar tidak mengubah total.
        $this->assertSame(User::count() + 1, (int) DB::table('users')->count());
        $this->actingAs($admin)->getJson('/api/users?member_type=staff')->assertOk();
        $this->actingAs($admin)->getJson('/api/users/stats')->assertOk()->assertJsonPath('data.total', User::count());
    }

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
            'password' => 'password123', 'password_confirmation' => 'password123',
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
            'password' => 'password123', 'password_confirmation' => 'password123',
            'nis_nip' => '4001',
            'member_type' => 'student',
            'class_group_id' => $this->classGroup()->id,
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
            'password' => 'password123', 'password_confirmation' => 'password123',
            'nis_nip' => '5002',
            'member_type' => 'student',
            'class_group_id' => $this->classGroup()->id,
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

        $class = $this->classGroup();

        foreach ([['siswa.nol1', '0'], ['siswa.nol2', 0], ['siswa.nol3', '00']] as [$username, $nisNip]) {
            $this->actingAs($admin)->postJson('/api/users', [
                'name' => 'Siswa Tanpa NIS',
                'username' => $username,
                'password' => 'password123', 'password_confirmation' => 'password123',
                'nis_nip' => $nisNip,
                'member_type' => 'student',
                'class_group_id' => $class->id,
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

    public function test_adding_student_member_places_them_in_class_and_issues_member_number(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $class = $this->classGroup();

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Rina Pertiwi',
            'username' => 'rina.pertiwi',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'nis_nip' => '7001',
            'member_type' => 'student',
            'class_group_id' => $class->id,
            'status' => 'active',
            'role' => 'student',
        ])->assertCreated();

        $response->assertJsonPath('data.placement.class_group_id', $class->id)
            ->assertJsonPath('data.placement.class_name', $class->display_name)
            ->assertJsonPath('data.class_or_position', $class->display_name);
        $this->assertNotNull($response->json('data.member_number'));

        $user = User::where('username', 'rina.pertiwi')->firstOrFail();
        $this->assertDatabaseHas('students', ['user_id' => $user->id, 'nis' => '7001']);
        $this->assertDatabaseHas('library_members', ['user_id' => $user->id, 'status' => 'active']);
        $this->assertDatabaseHas('student_class_assignments', [
            'student_id' => Student::where('user_id', $user->id)->value('id'),
            'class_group_id' => $class->id,
            'academic_year_id' => $class->academic_year_id,
            'is_active' => true,
        ]);
    }

    public function test_manual_member_form_stores_complete_member_profile(): void
    {
        $this->seed();
        Storage::fake('public');
        $admin = User::where('username', 'admin')->firstOrFail();
        $class = $this->classGroup();

        // Username tidak dikirim: NIS otomatis dipakai sebagai username, seperti registrasi siswa mandiri.
        $response = $this->actingAs($admin)->post('/api/users', [
            'name' => 'Sinta Maharani',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'nis_nip' => '7101',
            'member_type' => 'student',
            'gender' => 'P',
            'email' => ' Sinta@Sekolah.ID ',
            'phone' => '0812 3456 7890',
            'joined_at' => '2026-07-15',
            'class_group_id' => $class->id,
            'status' => 'active',
            'role' => 'student',
            'photo' => UploadedFile::fake()->image('sinta.jpg', 300, 400),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('data.username', '7101')
            ->assertJsonPath('data.gender', 'P')
            ->assertJsonPath('data.gender_label', 'Perempuan')
            ->assertJsonPath('data.email', 'sinta@sekolah.id')
            ->assertJsonPath('data.phone', '0812 3456 7890')
            ->assertJsonPath('data.joined_at', '2026-07-15');
        $this->assertStringContainsString('Nomor anggota', (string) $response->json('message'));

        $user = User::where('nis_nip', '7101')->firstOrFail();
        $this->assertNotNull($user->photo_path);
        Storage::disk('public')->assertExists($user->photo_path);
        $this->assertDatabaseHas('library_members', ['user_id' => $user->id, 'joined_at' => '2026-07-15 00:00:00']);
    }

    public function test_manual_member_form_rejects_mismatched_password_and_invalid_profile_fields(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $class = $this->classGroup();
        $base = [
            'name' => 'Budi Santoso', 'username' => 'budi.santoso', 'member_type' => 'student',
            'class_group_id' => $class->id, 'status' => 'active', 'role' => 'student',
        ];

        $this->actingAs($admin)->postJson('/api/users', [
            ...$base, 'password' => 'password123', 'password_confirmation' => 'password124',
        ])->assertStatus(422)->assertJsonPath('errors.password.0', 'Konfirmasi password belum sama dengan password awal.');

        $this->actingAs($admin)->postJson('/api/users', [
            ...$base, 'password' => 'password123', 'password_confirmation' => 'password123',
            'gender' => 'X', 'phone' => 'nol delapan', 'email' => 'bukan-email', 'joined_at' => now()->addDay()->toDateString(),
        ])->assertStatus(422)->assertJsonValidationErrors(['gender', 'phone', 'email', 'joined_at']);

        $this->assertDatabaseMissing('users', ['username' => 'budi.santoso']);
    }

    public function test_student_needs_a_class_and_staff_needs_a_position(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $base = ['password' => 'password123', 'password_confirmation' => 'password123', 'status' => 'active'];

        $this->actingAs($admin)->postJson('/api/users', [
            ...$base, 'name' => 'Siswa Tanpa Kelas', 'username' => 'siswa.tanpa.kelas', 'member_type' => 'student', 'role' => 'student',
        ])->assertStatus(422)->assertJsonPath('errors.class_group_id.0', 'Kelas wajib dipilih untuk anggota siswa. Pilih tingkat, jurusan, lalu kelasnya.');

        $this->actingAs($admin)->postJson('/api/users', [
            ...$base, 'name' => 'Staf Tanpa Jabatan', 'username' => 'staf.tanpa.jabatan', 'member_type' => 'staff', 'role' => 'staff',
        ])->assertStatus(422)->assertJsonPath('errors.position.0', 'Jabatan wajib diisi untuk anggota guru atau staf.');

        // Kelas nonaktif tidak boleh dipakai walaupun id-nya dikirim langsung.
        $class = $this->classGroup();
        $class->update(['is_active' => false]);
        $this->actingAs($admin)->postJson('/api/users', [
            ...$base, 'name' => 'Siswa Kelas Nonaktif', 'username' => 'siswa.nonaktif', 'member_type' => 'student', 'role' => 'student',
            'class_group_id' => $class->id,
        ])->assertStatus(422)->assertJsonValidationErrors('class_group_id');
    }

    public function test_moving_student_to_another_class_closes_the_previous_placement(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $from = $this->classGroup('TKJ');
        $to = $this->classGroup('DKV');

        $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Agus Saputra', 'username' => 'agus.saputra', 'password' => 'password123', 'password_confirmation' => 'password123', 'nis_nip' => '7002',
            'member_type' => 'student', 'class_group_id' => $from->id, 'status' => 'active', 'role' => 'student',
        ])->assertCreated();
        $user = User::where('username', 'agus.saputra')->firstOrFail();

        $this->actingAs($admin)->putJson("/api/users/{$user->id}", [
            'name' => 'Agus Saputra', 'username' => 'agus.saputra', 'password' => '', 'nis_nip' => '7002',
            'member_type' => 'student', 'class_group_id' => $to->id, 'status' => 'active', 'role' => 'student',
        ])->assertOk()->assertJsonPath('data.placement.class_group_id', $to->id);

        $studentId = Student::where('user_id', $user->id)->value('id');
        $this->assertDatabaseHas('student_class_assignments', ['student_id' => $studentId, 'class_group_id' => $from->id, 'is_active' => false]);
        $this->assertDatabaseHas('student_class_assignments', ['student_id' => $studentId, 'class_group_id' => $to->id, 'is_active' => true]);
        $this->assertSame($to->display_name, $user->fresh()->class_or_position);

        // Memperbarui data tanpa mengirim kelas tidak boleh menghapus penempatan yang sudah ada.
        $this->actingAs($admin)->putJson("/api/users/{$user->id}", [
            'name' => 'Agus S', 'username' => 'agus.saputra', 'password' => '', 'nis_nip' => '7002',
            'member_type' => 'student', 'status' => 'active', 'role' => 'student',
        ])->assertOk()->assertJsonPath('data.placement.class_group_id', $to->id);
    }

    public function test_status_can_be_changed_without_resending_the_whole_form(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $class = $this->classGroup();
        $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Dewi Lestari', 'username' => 'dewi.lestari', 'password' => 'password123', 'password_confirmation' => 'password123', 'nis_nip' => '7003',
            'member_type' => 'student', 'class_group_id' => $class->id, 'status' => 'active', 'role' => 'student',
        ])->assertCreated();
        $user = User::where('username', 'dewi.lestari')->firstOrFail();

        $this->actingAs($admin)->patchJson("/api/users/{$user->id}/status", ['status' => 'suspended'])
            ->assertOk()->assertJsonPath('data.status', 'suspended')
            ->assertJsonPath('data.placement.class_group_id', $class->id);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'status' => 'suspended']);
        $this->assertDatabaseHas('library_members', ['user_id' => $user->id, 'status' => 'suspended']);
        $this->actingAs($admin)->patchJson("/api/users/{$admin->id}/status", ['status' => 'inactive'])->assertStatus(422);
    }

    public function test_only_super_admin_can_create_admin_accounts(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $librarian = User::factory()->create(['username' => 'pustakawan', 'member_type' => 'staff']);
        $librarian->assignRole('librarian');
        $account = [
            'name' => 'Petugas Baru', 'password' => 'password123', 'password_confirmation' => 'password123',
            'member_type' => 'staff', 'position' => 'Pustakawan', 'status' => 'active',
        ];

        // Pustakawan punya izin users.create, tetapi tidak boleh membuat akun berhak akses penuh.
        $this->actingAs($librarian)->postJson('/api/users', [...$account, 'username' => 'eskalasi', 'role' => 'super_admin'])->assertForbidden();
        $this->actingAs($librarian)->postJson('/api/users', [...$account, 'username' => 'eskalasi2', 'role' => 'librarian'])->assertForbidden();
        $this->assertDatabaseMissing('users', ['username' => 'eskalasi']);

        // Pustakawan tetap boleh menambah anggota guru/staf biasa.
        $this->actingAs($librarian)->postJson('/api/users', [...$account, 'username' => 'guru.biasa', 'role' => 'staff'])->assertCreated();

        $this->actingAs($admin)->postJson('/api/users', [...$account, 'username' => 'pustakawan.dua', 'role' => 'librarian'])
            ->assertCreated()->assertJsonPath('data.role', 'librarian');

        // Mengubah akun admin yang sudah ada juga hanya boleh dilakukan Super Admin.
        $this->actingAs($librarian)->putJson("/api/users/{$librarian->id}", [
            ...$account, 'username' => 'pustakawan', 'role' => 'staff', 'password' => '', 'password_confirmation' => '',
        ])->assertForbidden();
    }

    public function test_member_list_can_be_filtered_by_role(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $librarian = User::factory()->create(['username' => 'pustakawan', 'member_type' => 'staff']);
        $librarian->assignRole('librarian');
        User::factory()->create(['username' => 'siswa.satu', 'member_type' => 'student'])->assignRole('student');

        $response = $this->actingAs($admin)->getJson('/api/users?role=super_admin,librarian')->assertOk();
        $usernames = collect($response->json('data'))->pluck('username')->all();

        $this->assertEqualsCanonicalizing(['admin', 'pustakawan'], $usernames);
        $this->actingAs($admin)->getJson('/api/users?role=student')->assertOk()->assertJsonPath('data.0.username', 'siswa.satu');
    }

    public function test_form_options_only_expose_active_academic_master_data(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        Major::where('code', 'TSM')->firstOrFail()->update(['is_active' => false]);

        $response = $this->actingAs($admin)->getJson('/api/users/form-options')->assertOk();

        $this->assertNotEmpty($response->json('data.levels'));
        $this->assertNotContains('TSM', array_column($response->json('data.majors'), 'code'));
        $this->assertNotContains('TSM', array_column($response->json('data.classes'), 'major_code'));
        $this->assertNotNull($response->json('data.default_academic_year_id'));
        $this->assertSame(
            ClassGroup::whereHas('major', fn ($query) => $query->where('is_active', true))->count(),
            count($response->json('data.classes')),
        );
    }

    public function test_import_places_students_from_tingkat_jurusan_and_kelas_columns(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();
        $existing = $this->classGroup('TKJ');
        $csv = "name,username,nis_nip,member_type,tingkat,jurusan,kelas,jabatan,password\n".
            "Siswa Kelas Ada,siswa.ada,8001,student,10,TKJ,A,,password123\n".          // kelas sudah ada
            "Siswa Rombel Baru,siswa.baru,8002,student,X,Teknik Komputer dan Jaringan,C,,password123\n". // rombel dibuat otomatis
            "Siswa Tanpa Kelas,siswa.kosong,8003,student,,,,,password123\n".            // tanpa penempatan
            "Guru Bahasa,guru.bahasa,8004,staff,,,,Guru Bahasa Indonesia,password123\n".
            "Siswa Jurusan Salah,siswa.salah,8005,student,10,XYZ,A,,password123\n".     // jurusan tidak ada
            "Siswa Kelas Separuh,siswa.separuh,8006,student,10,TKJ,,,password123\n";    // penempatan tidak lengkap

        $response = $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('anggota.csv', $csv),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('data.total_rows', 6)
            ->assertJsonPath('data.success_rows', 4)
            ->assertJsonPath('data.failed_rows', 2);

        $this->assertDatabaseHas('users', ['username' => 'siswa.ada', 'class_or_position' => $existing->display_name]);
        $this->assertDatabaseHas('student_class_assignments', [
            'student_id' => Student::where('nis', '8001')->value('id'),
            'class_group_id' => $existing->id,
            'is_active' => true,
        ]);

        // Rombel C belum ada di master dan dibuatkan otomatis pada tahun ajaran aktif.
        $created = ClassGroup::where('group_name', 'C')->where('education_level_id', $existing->education_level_id)
            ->where('major_id', $existing->major_id)->firstOrFail();
        $this->assertTrue($created->is_active);
        $this->assertDatabaseHas('student_class_assignments', [
            'student_id' => Student::where('nis', '8002')->value('id'),
            'class_group_id' => $created->id,
            'is_active' => true,
        ]);

        // Siswa tanpa penempatan tetap tersimpan dengan nomor anggota, tanpa kelas.
        $unplaced = User::where('username', 'siswa.kosong')->firstOrFail();
        $this->assertDatabaseHas('library_members', ['user_id' => $unplaced->id]);
        $this->assertNull($unplaced->class_or_position);
        $this->assertDatabaseMissing('student_class_assignments', ['student_id' => Student::where('nis', '8003')->value('id')]);

        $this->assertDatabaseHas('users', ['username' => 'guru.bahasa', 'member_type' => 'staff', 'class_or_position' => 'Guru Bahasa Indonesia']);
        $this->assertDatabaseMissing('users', ['username' => 'siswa.salah']);
        $this->assertDatabaseMissing('users', ['username' => 'siswa.separuh']);
        $this->assertDatabaseCount('import_failures', 2);

        $errors = collect($response->json('data.failures'))->pluck('errors')->flatten()->implode(' ');
        $this->assertStringContainsString('Jurusan "XYZ" tidak ada pada master akademik', $errors);
        $this->assertStringContainsString('butuh tingkat, jurusan, dan kelas sekaligus', $errors);

        $notes = collect($response->json('data.notes'))->pluck('message')->implode(' ');
        $this->assertStringContainsString('dibuatkan otomatis', $notes);
        $this->assertStringContainsString('tanpa penempatan kelas', $notes);
    }

    public function test_import_rejects_unknown_headers_but_still_accepts_the_old_template(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();

        $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('salah.csv', "nama,user,sandi\nA,b,c\n"),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('file');

        $legacy = "name,username,nis_nip,member_type,class_or_position,password\n".
            "Siswa Lama,siswa.template.lama,9001,student,X IPA 1,password123\n";
        $response = $this->actingAs($admin)->post('/api/imports/users', [
            'file' => UploadedFile::fake()->createWithContent('lama.csv', $legacy),
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.success_rows', 1);

        $this->assertDatabaseHas('users', ['username' => 'siswa.template.lama', 'class_or_position' => 'X IPA 1']);
        $this->assertStringContainsString('template lama', collect($response->json('data.notes'))->pluck('message')->implode(' '));
    }

    public function test_import_template_lists_the_active_academic_master_data(): void
    {
        $this->seed();
        $admin = User::where('username', 'admin')->firstOrFail();

        $this->actingAs($admin)->get('/api/imports/users/template')
            ->assertOk()
            ->assertDownload('template-import-anggota.xlsx');
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

    /** Kelas aktif dari seeder: tingkat 10 pada jurusan yang diminta, rombel A. */
    private function classGroup(string $majorCode = 'TKJ'): ClassGroup
    {
        return ClassGroup::query()
            ->whereHas('educationLevel', fn ($query) => $query->where('name', '10'))
            ->whereHas('major', fn ($query) => $query->where('code', $majorCode))
            ->where('group_name', 'A')
            ->with(['academicYear', 'educationLevel', 'major'])
            ->firstOrFail();
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
