<?php

namespace App\Services;

use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;

class QrCodeService
{
    public function dataUri(string $value, int $size = 240): string
    {
        return (new PngWriter)->write(new QrCode(data: $value, size: $size, margin: 8))->getDataUri();
    }
}
