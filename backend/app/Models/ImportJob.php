<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ImportJob extends Model
{
    protected $fillable = ['user_id', 'filename', 'status', 'total_rows', 'success_rows', 'updated_rows', 'failed_rows', 'notes'];

    protected function casts(): array
    {
        return ['notes' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function failures(): HasMany
    {
        return $this->hasMany(ImportFailure::class);
    }
}
