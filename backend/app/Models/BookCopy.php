<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class BookCopy extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'book_id', 'inventory_code', 'qr_token', 'status',
        'shelf_location', 'condition_notes',
    ];

    protected $hidden = ['qr_token'];

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function loans(): HasMany
    {
        return $this->hasMany(Loan::class);
    }

    public function activeLoan(): HasOne
    {
        return $this->hasOne(Loan::class, 'active_copy_id');
    }
}
