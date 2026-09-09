<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\ClassGroup;
use App\Models\EducationLevel;
use App\Models\LoanPolicy;
use App\Models\Major;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = [
            'users.view', 'users.create', 'users.update', 'users.delete', 'roles.manage', 'academic.manage',
            'catalog.view', 'catalog.create', 'catalog.update', 'catalog.delete',
            'circulation.borrow', 'circulation.return', 'loans.view-all', 'loans.view-own',
            'fines.view-all', 'fines.view-own', 'fines.pay', 'fines.waive',
            'reports.view', 'settings.view', 'settings.manage', 'audit.view',
        ];

        foreach ($permissions as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $librarian = Role::findOrCreate('librarian', 'web');
        $staff = Role::findOrCreate('staff', 'web');
        $student = Role::findOrCreate('student', 'web');

        $superAdmin->syncPermissions($permissions);
        $librarian->syncPermissions([
            'users.view', 'users.create', 'users.update', 'academic.manage',
            'catalog.view', 'catalog.create', 'catalog.update', 'catalog.delete',
            'circulation.borrow', 'circulation.return', 'loans.view-all',
            'fines.view-all', 'fines.pay', 'reports.view', 'audit.view', 'settings.view',
        ]);
        $staff->syncPermissions(['catalog.view', 'loans.view-own', 'fines.view-own']);
        $student->syncPermissions(['catalog.view', 'loans.view-own', 'fines.view-own']);

        $year = AcademicYear::updateOrCreate(['name' => '2026/2027'], ['starts_at' => '2026-07-01', 'ends_at' => '2027-06-30', 'is_active' => true]);
        $levels = collect([10, 11, 12])->mapWithKeys(fn (int $level) => [$level => EducationLevel::updateOrCreate(['name' => (string) $level], ['sort_order' => $level, 'is_active' => true])]);
        $majors = collect(['TKJ' => 'Teknik Komputer dan Jaringan', 'TKR' => 'Teknik Kendaraan Ringan', 'TSM' => 'Teknik Sepeda Motor', 'DKV' => 'Desain Komunikasi Visual', 'AKL' => 'Akuntansi dan Keuangan Lembaga'])->mapWithKeys(fn (string $name, string $code) => [$code => Major::updateOrCreate(['code' => $code], ['name' => $name, 'is_active' => true])]);
        foreach ($levels as $level) {
            foreach ($majors as $major) {
                ClassGroup::updateOrCreate(['academic_year_id' => $year->id, 'education_level_id' => $level->id, 'major_id' => $major->id, 'group_name' => 'A'], ['is_active' => true]);
            }
        }

        LoanPolicy::updateOrCreate(['member_type' => 'student'], ['max_books' => 2, 'loan_days' => 7, 'fine_per_day' => 1000, 'fine_block_threshold' => 50000]);
        LoanPolicy::updateOrCreate(['member_type' => 'staff'], ['max_books' => 5, 'loan_days' => 14, 'fine_per_day' => 1000, 'fine_block_threshold' => 100000]);

        $admin = User::updateOrCreate(['email' => 'admin@bmlibrary.local'], ['name' => 'Super Admin', 'username' => 'admin', 'password' => Hash::make(env('SEED_ADMIN_PASSWORD', 'ChangeMeNow!')), 'member_type' => 'staff', 'status' => 'active']);
        $admin->syncRoles([$superAdmin]);
    }
}
