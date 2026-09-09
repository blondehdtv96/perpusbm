<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $table): void { $table->id(); $table->string('name', 20)->unique(); $table->date('starts_at')->nullable(); $table->date('ends_at')->nullable(); $table->boolean('is_active')->default(true)->index(); $table->timestamps(); });
        Schema::create('education_levels', function (Blueprint $table): void { $table->id(); $table->string('name', 30)->unique(); $table->unsignedTinyInteger('sort_order')->default(0); $table->boolean('is_active')->default(true)->index(); $table->timestamps(); });
        Schema::create('majors', function (Blueprint $table): void { $table->id(); $table->string('code', 20)->unique(); $table->string('name', 150); $table->boolean('is_active')->default(true)->index(); $table->timestamps(); });
        Schema::create('class_groups', function (Blueprint $table): void { $table->id(); $table->foreignId('academic_year_id')->constrained()->restrictOnDelete(); $table->foreignId('education_level_id')->constrained()->restrictOnDelete(); $table->foreignId('major_id')->constrained()->restrictOnDelete(); $table->string('group_name', 30); $table->boolean('is_active')->default(true)->index(); $table->timestamps(); $table->unique(['academic_year_id', 'education_level_id', 'major_id', 'group_name'], 'class_group_unique'); });
        Schema::create('students', function (Blueprint $table): void { $table->id(); $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete(); $table->string('nis', 100)->unique(); $table->timestamps(); });
        Schema::create('library_members', function (Blueprint $table): void { $table->id(); $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete(); $table->string('member_number', 40)->unique(); $table->string('status', 20)->default('active')->index(); $table->date('joined_at'); $table->timestamps(); });
        Schema::create('student_class_assignments', function (Blueprint $table): void { $table->id(); $table->foreignId('student_id')->constrained()->cascadeOnDelete(); $table->foreignId('class_group_id')->constrained()->restrictOnDelete(); $table->foreignId('academic_year_id')->constrained()->restrictOnDelete(); $table->date('assigned_at'); $table->date('ended_at')->nullable(); $table->boolean('is_active')->default(true)->index(); $table->timestamps(); $table->index(['student_id', 'academic_year_id', 'is_active'], 'student_assignment_lookup'); });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_class_assignments'); Schema::dropIfExists('library_members'); Schema::dropIfExists('students'); Schema::dropIfExists('class_groups'); Schema::dropIfExists('majors'); Schema::dropIfExists('education_levels'); Schema::dropIfExists('academic_years');
    }
};
