<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicYear extends Model
{
    protected $fillable = ['name', 'starts_at', 'ends_at', 'is_active'];
    protected function casts(): array { return ['starts_at' => 'date', 'ends_at' => 'date', 'is_active' => 'boolean']; }
    public function classGroups(): HasMany { return $this->hasMany(ClassGroup::class); }
}
