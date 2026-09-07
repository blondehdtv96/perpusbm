<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinePayment extends Model
{
    protected $fillable = ['fine_id', 'received_by', 'amount', 'method', 'reference', 'notes'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function fine(): BelongsTo
    {
        return $this->belongsTo(Fine::class);
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
