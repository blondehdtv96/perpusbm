<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentClassAssignment extends Model
{
    protected $fillable = ['student_id', 'class_group_id', 'academic_year_id', 'assigned_at', 'ended_at', 'is_active'];
    protected function casts(): array { return ['assigned_at' => 'date', 'ended_at' => 'date', 'is_active' => 'boolean']; }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function classGroup(): BelongsTo { return $this->belongsTo(ClassGroup::class); }
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
}
