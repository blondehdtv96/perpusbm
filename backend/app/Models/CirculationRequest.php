<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CirculationRequest extends Model
{
    protected $fillable = [
        'idempotency_key', 'operation', 'request_hash', 'status', 'response', 'expires_at',
    ];

    protected function casts(): array
    {
        return ['response' => 'array', 'expires_at' => 'datetime'];
    }
}
