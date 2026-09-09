<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClassGroup extends Model
{
    protected $fillable = ['academic_year_id', 'education_level_id', 'major_id', 'group_name', 'is_active'];
    protected function casts(): array { return ['is_active' => 'boolean']; }
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
    public function educationLevel(): BelongsTo { return $this->belongsTo(EducationLevel::class); }
    public function major(): BelongsTo { return $this->belongsTo(Major::class); }
    public function assignments(): HasMany { return $this->hasMany(StudentClassAssignment::class); }
    public function getDisplayNameAttribute(): string { return trim("{$this->educationLevel?->name} {$this->major?->code} {$this->group_name}"); }
}
