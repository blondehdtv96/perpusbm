<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    protected $fillable = [
        'name', 'username', 'email', 'password', 'nis_nip', 'member_type', 'phone',
        'class_or_position', 'photo_path', 'status',
    ];

    protected $hidden = ['password', 'remember_token', 'member_qr_token'];

    protected function casts(): array
    {
        return ['email_verified_at' => 'datetime', 'password' => 'hashed'];
    }

    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            $user->member_qr_token ??= Str::random(64);
        });
    }

    public function loans(): HasMany
    {
        return $this->hasMany(Loan::class);
    }

    public function student(): HasOne
    {
        return $this->hasOne(Student::class);
    }

    public function libraryMember(): HasOne
    {
        return $this->hasOne(LibraryMember::class);
    }
}
