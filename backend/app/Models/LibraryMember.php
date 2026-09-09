<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LibraryMember extends Model
{
    protected $fillable = ['user_id', 'member_number', 'status', 'joined_at'];
    protected function casts(): array { return ['joined_at' => 'date']; }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
