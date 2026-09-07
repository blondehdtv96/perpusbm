# BM Library

BM Library adalah aplikasi manajemen perpustakaan **mobile-first** untuk mengelola anggota, katalog, eksemplar fisik, peminjaman, pengembalian, denda, laporan, dan audit aktivitas. Backend menggunakan Laravel REST API dan frontend menggunakan React SPA.

## Fitur utama

- Autentikasi berbasis Laravel Sanctum dan session SPA.
- RBAC granular untuk `super_admin`, `librarian`, `staff`, dan `student`.
- Pengelolaan anggota, profil, status akun, serta impor CSV/XLSX.
- Template impor XLSX dengan petunjuk, contoh, dan dropdown tipe anggota.
- Kategori, katalog, cover buku, eksemplar, lokasi rak, dan status ketersediaan.
- QR anggota dan eksemplar, label PDF, scanner kamera, serta input kode manual.
- Peminjaman dan pengembalian atomik dengan idempotency key.
- Pinjaman aktif, riwayat, keterlambatan, denda, pembayaran, dan waiver.
- Dashboard berdasarkan role, notifikasi H-1, laporan CSV/XLSX/PDF, dan audit log.
- UI responsif untuk desktop dan perangkat seluler.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Backend | PHP 8.2+, Laravel 12.69.1, Sanctum 4.3.3 |
| Authorization | Spatie Laravel Permission 6.21.0 |
| Frontend | React 19.2.8, React Router 7.18.3, Zustand 5.0.15 |
| Build dan UI | Vite 8.2.2, Tailwind CSS 4.3.3 |
| Database | MySQL untuk aplikasi, SQLite in-memory untuk test |
| Dokumen | Dompdf, PhpSpreadsheet, Endroid QR Code |

## Struktur proyek

```text
bmlibrary/
├── backend/                         # Laravel REST API
│   ├── app/                         # Controller, model, service, notification
│   ├── database/                    # Migration, factory, dan seeder
│   ├── routes/                      # API dan scheduler
│   └── tests/                       # Test backend
├── frontend/                        # React SPA
│   ├── public/
│   └── src/                         # Page, component, store, dan API client
├── konsep-aplikasi-perpustakaan.md # Konsep produk dan arsitektur
└── README.md
```

## Persyaratan

- PHP 8.2 atau lebih baru.
- Composer.
- Node.js dan npm yang kompatibel dengan Vite 8.
- MySQL/MariaDB atau paket XAMPP.
- Ekstensi PHP yang diminta Composer, terutama PDO MySQL, mbstring, fileinfo, GD, dan ZIP.

## Instalasi

### 1. Clone repository

```cmd
git clone <repository-url>
cd bmlibrary
```

### 2. Siapkan backend

```cmd
cd backend
copy .env.example .env
composer install
php artisan key:generate
```

Buat database MySQL bernama `bmlibrary`, lalu sesuaikan variabel berikut pada `backend/.env`:

```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=bmlibrary
DB_USERNAME=root
DB_PASSWORD=
```

Jalankan migrasi, seeder, dan storage link:

```cmd
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

Backend tersedia di `http://localhost:8000`.

### 3. Siapkan frontend

Buka terminal baru dari root proyek:

```cmd
cd frontend
copy .env.example .env
npm ci
npm run dev
```

Frontend tersedia di `http://localhost:5173`. Saat `VITE_API_URL` kosong, proxy Vite meneruskan `/api`, `/sanctum`, dan `/storage` ke `http://127.0.0.1:8000`.

## Akun pengembangan

Seeder membuat akun berikut:

| Field | Nilai |
| --- | --- |
| Username | `admin` |
| Email | `admin@bmlibrary.local` |
| Role | `super_admin` |
| Password | Nilai `SEED_ADMIN_PASSWORD` |

Nilai fallback development adalah `ChangeMeNow!`. **Ganti `SEED_ADMIN_PASSWORD` sebelum menjalankan seeder di lingkungan publik atau produksi.**

## Akses melalui jaringan LAN

Vite sudah mendengarkan pada `0.0.0.0`. Tambahkan IP komputer ke `SANCTUM_STATEFUL_DOMAINS` pada `backend/.env`, contohnya:

```dotenv
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173,192.168.1.10:5173
```

Kemudian jalankan:

```cmd
php artisan optimize:clear
```

Akses frontend dari perangkat lain melalui `http://IP-KOMPUTER:5173`. Fitur kamera browser pada perangkat seluler umumnya memerlukan HTTPS; input kode manual tetap tersedia melalui HTTP.

## Perintah pengembangan

### Backend

```cmd
cd backend
php artisan serve
php artisan queue:work
php artisan schedule:work
php artisan test
vendor\bin\pint --test
```

### Frontend

```cmd
cd frontend
npm run dev
npm run lint
npm run build
npm run preview
```

Frontend saat ini belum memiliki script unit test terpisah; validasi utamanya adalah ESLint dan production build.

## Scheduler

Scheduler harian berjalan pukul 08:00 untuk:

- Menandai pinjaman aktif yang melewati jatuh tempo.
- Mengirim notifikasi H-1 sebelum jatuh tempo.
- Membersihkan idempotency request yang kedaluwarsa.

Pada development gunakan `php artisan schedule:work`. Pada production jalankan `php artisan schedule:run` setiap menit melalui cron atau Windows Task Scheduler.

## Konfigurasi penting

Jangan commit file `.env`. Gunakan `backend/.env.example` dan `frontend/.env.example` sebagai referensi. Konfigurasi penting meliputi:

- `APP_URL`, `FRONTEND_URL`, dan `SANCTUM_STATEFUL_DOMAINS`.
- `DB_*`, `SESSION_*`, `CACHE_STORE`, dan `QUEUE_CONNECTION`.
- `MAIL_*` untuk pengiriman email.
- `SEED_ADMIN_PASSWORD` untuk akun administrator awal.
- `VITE_API_URL` untuk alamat API frontend.

## Checklist deployment

- Gunakan `APP_ENV=production` dan `APP_DEBUG=false`.
- Buat `APP_KEY` unik dan gunakan kredensial database yang aman.
- Ganti password akun seed dan jangan gunakan kredensial development.
- Konfigurasikan HTTPS, cookie session, CORS, dan domain Sanctum dengan benar.
- Jalankan `php artisan migrate --force`, queue worker, dan scheduler.
- Arahkan document root web server ke `backend/public`.
- Build frontend menggunakan `npm ci` dan `npm run build`.
- Pastikan folder `storage` dan `bootstrap/cache` dapat ditulis oleh web server.

## Status implementasi

MVP mencakup autentikasi, RBAC, anggota dan impor data, kartu QR, katalog dan inventaris, sirkulasi, denda, dashboard, notifikasi, laporan, pengaturan, serta audit log. Reservasi, rating/ulasan, integrasi WhatsApp, dark mode, dan offline PWA penuh belum termasuk dalam MVP.

## Keamanan repository

Root `.gitignore` mengabaikan environment lokal, dependency, build output, database SQLite, log, cache, storage runtime, dan konfigurasi IDE. File lock dependency (`composer.lock` dan `package-lock.json`) serta seluruh `.env.example` tetap harus dikomit agar instalasi konsisten.
