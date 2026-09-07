<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Book extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'book_category_id', 'title', 'author', 'publisher',
        'isbn', 'cover_path', 'description',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(BookCategory::class, 'book_category_id');
    }

    public function copies(): HasMany
    {
        return $this->hasMany(BookCopy::class);
    }
}
