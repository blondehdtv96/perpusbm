<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'app_name', 'app_subtitle', 'logo_path', 'footer_text',
    ];

    protected $appends = ['logo_url'];

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? asset('storage/'.$this->logo_path) : null;
    }

    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'app_name' => 'SMK Bina Mandiri',
            'app_subtitle' => 'Library Management',
        ]);
    }
}
