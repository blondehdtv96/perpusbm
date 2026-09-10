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

Jangan commit file `.env`. Gunakan `backend/.env.example` dan `frontend/.env.example` sebagai referensi.

Aplikasi menggunakan **Sanctum SPA cookie authentication**. Seluruh route API selalu memakai cookie terenkripsi, session, dan CSRF; karena itu `SESSION_DRIVER=database` membutuhkan tabel `sessions` dan setiap request mutasi harus memperoleh cookie dari `/sanctum/csrf-cookie` terlebih dahulu.

Untuk production HTTPS satu origin atau subdomain dalam site yang sama:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.sch.id
FRONTEND_URL=https://library.example.sch.id
CORS_ALLOWED_ORIGINS=https://library.example.sch.id
SESSION_DRIVER=database
SESSION_DOMAIN=.example.sch.id
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

Gunakan origin lengkap tanpa trailing slash pada `CORS_ALLOWED_ORIGINS`. Jika frontend dan backend benar-benar cross-site, gunakan `SESSION_SAME_SITE=none` dan tetap wajib memakai HTTPS serta `SESSION_SECURE_COOKIE=true`. Jika frontend dilayani satu origin dengan Laravel melalui reverse proxy, biarkan `VITE_API_URL` kosong. Jika berbeda origin, isi `VITE_API_URL` **sebelum** `npm run build` karena nilainya ditanam saat proses build.

Jangan menjalankan `php artisan key:generate` ulang pada production yang sudah memiliki data; perubahan `APP_KEY` akan membatalkan cookie dan data terenkripsi.

## Deployment production

Dari folder `backend`, jalankan secara berurutan setelah source code dan `.env` production tersedia:

```cmd
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php artisan optimize:clear
php artisan migrate:status
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan event:cache
php artisan queue:restart
```

Migration `2026_09_10_000007_ensure_sessions_table_exists.php` memastikan instalasi lama juga mempunyai tabel `sessions` tanpa menghapus data yang sudah ada. Jangan menggunakan `migrate:fresh`, `migrate:reset`, atau rollback pada database production.

Build frontend setelah menetapkan `VITE_API_URL` sesuai topologi server:

```cmd
cd frontend
npm ci
npm run build
```

Deploy isi `frontend/dist` dan aktifkan SPA fallback ke `index.html`. Proxy development di `vite.config.js` tidak ikut masuk ke build production; web server production harus meneruskan `/api`, `/sanctum`, dan `/storage` ke Laravel jika memakai pola same-origin.

Checklist server:

- Arahkan document root backend ke `backend/public`, bukan root proyek.
- Pastikan `storage` dan `bootstrap/cache` dapat ditulis oleh user web server.
- Pastikan tabel `sessions`, `cache`, `jobs`, dan tabel aplikasi tersedia setelah migration.
- Gunakan HTTPS dan jangan memakai kredensial database atau password seed development.
- Jalankan queue worker melalui service manager dan `php artisan schedule:run` setiap menit.
- Periksa `/up`, lalu uji `/sanctum/csrf-cookie` → login → `/api/auth/me` melalui domain HTTPS production.
- Jika masih 500, periksa `backend/storage/logs/laravel.log` setelah request terbaru; jangan aktifkan `APP_DEBUG=true` pada server publik.

## Status implementasi

MVP mencakup autentikasi, RBAC, anggota dan impor data, kartu QR, katalog dan inventaris, sirkulasi, denda, dashboard, notifikasi, laporan, pengaturan, serta audit log. Reservasi, rating/ulasan, integrasi WhatsApp, dark mode, dan offline PWA penuh belum termasuk dalam MVP.

## Keamanan repository

Root `.gitignore` mengabaikan environment lokal, dependency, build output, database SQLite, log, cache, storage runtime, dan konfigurasi IDE. File lock dependency (`composer.lock` dan `package-lock.json`) serta seluruh `.env.example` tetap harus dikomit agar instalasi konsisten.
