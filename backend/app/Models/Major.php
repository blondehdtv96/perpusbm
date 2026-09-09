<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Major extends Model
{
    protected $fillable = ['code', 'name', 'is_active'];
    protected function casts(): array { return ['is_active' => 'boolean']; }
    public function classGroups(): HasMany { return $this->hasMany(ClassGroup::class); }
}
