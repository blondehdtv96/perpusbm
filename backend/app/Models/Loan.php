<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Loan extends Model
{
    protected $fillable = [
        'user_id', 'book_copy_id', 'processed_by', 'returned_by',
        'active_copy_id', 'borrowed_at', 'due_at', 'returned_at', 'due_reminded_at',
        'status', 'loan_days_snapshot', 'fine_per_day_snapshot',
    ];

    protected function casts(): array
    {
        return [
            'borrowed_at' => 'datetime', 'due_at' => 'datetime',
            'returned_at' => 'datetime', 'due_reminded_at' => 'datetime',
            'fine_per_day_snapshot' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function bookCopy(): BelongsTo
    {
        return $this->belongsTo(BookCopy::class);
    }

    public function fine(): HasOne
    {
        return $this->hasOne(Fine::class);
    }
}
