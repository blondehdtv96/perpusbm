<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanPolicy extends Model
{
    protected $fillable = [
        'member_type', 'max_books', 'loan_days',
        'fine_per_day', 'fine_block_threshold',
    ];

    protected function casts(): array
    {
        return ['fine_per_day' => 'decimal:2', 'fine_block_threshold' => 'decimal:2'];
    }
}
