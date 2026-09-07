<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Fine extends Model
{
    protected $fillable = [
        'loan_id', 'amount', 'paid_amount', 'status', 'paid_at',
        'waived_by', 'waived_at', 'waiver_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2', 'paid_amount' => 'decimal:2',
            'paid_at' => 'datetime', 'waived_at' => 'datetime',
        ];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(FinePayment::class);
    }
}
