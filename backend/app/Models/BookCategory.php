<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BookCategory extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'slug', 'description'];

    public function books(): HasMany
    {
        return $this->hasMany(Book::class);
    }
}
