# PROMPT: Aplikasi Manajemen Perpustakaan Digital (Mobile-First)

## Konteks & Tujuan
Buatkan aplikasi manajemen perpustakaan sekolah/kampus yang **mobile-first**, dengan fitur RBAC (Role-Based Access Control), manajemen user, dan sistem QR/Barcode untuk peminjaman-pengembalian buku secara cepat. Stack: **Laravel (backend/API)** + **React JS (frontend/SPA)** + **MySQL (database)**.

---

## 1. Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Laravel 11.x (REST API), Laravel Sanctum (auth token) |
| Frontend | React JS (Vite), React Router, Zustand/Redux Toolkit (state), Tailwind CSS (mobile-first utility) |
| Database | MySQL 8.x |
| QR/Barcode | `simple-qrcode` (Laravel, generate) + `html5-qrcode` atau `react-qr-reader` (React, scan via kamera HP) |
| Autentikasi | Laravel Sanctum (SPA token-based), middleware RBAC custom (Spatie `laravel-permission` disarankan) |
| Notifikasi | Laravel Notification (email/WhatsApp gateway opsional) untuk reminder jatuh tempo |
| File storage | Laravel Storage (cover buku, foto profil) |

---

## 2. Fitur Utama

### A. Autentikasi & RBAC
- Login/logout dengan token (Sanctum)
- Role: **Super Admin, Admin Perpustakaan (Pustakawan), Guru/Staff, Siswa/Anggota**
- Permission granular per modul (create/read/update/delete) memakai `spatie/laravel-permission`
- Middleware proteksi route API berdasarkan role & permission
- Halaman "Akses Ditolak" di frontend jika role tidak sesuai

### B. Manajemen User
- CRUD user (admin only)
- Import user massal via Excel/CSV (khusus siswa per angkatan/kelas)
- Profil user: foto, NIS/NIP, kelas/jabatan, kontak
- Setiap user otomatis mendapat **kartu anggota digital** berisi QR unik (berdasarkan ID user)
- Reset password oleh admin / self-service via email

### C. Manajemen Buku
- CRUD data buku: judul, penulis, penerbit, ISBN, kategori, stok, lokasi rak, cover
- Generate **barcode/QR code otomatis** untuk setiap eksemplar buku (unik per kode inventaris, bukan hanya per judul)
- Cetak label QR/barcode untuk ditempel di buku fisik (export PDF label)
- Pencarian & filter buku (judul, kategori, ketersediaan)

### D. Sirkulasi (Peminjaman & Pengembalian) via Scan
- Pustakawan/Admin scan QR **kartu anggota** siswa → scan QR **buku** → transaksi peminjaman otomatis tercatat
- Scan ulang QR buku saat pengembalian → status otomatis update, hitung denda jika telat
- Riwayat peminjaman per user & per buku
- Aturan peminjaman: maksimal jumlah buku, durasi pinjam, denda keterlambatan (dikonfigurasi admin)
- Notifikasi (in-app/email) H-1 sebelum jatuh tempo

### E. Dashboard & Laporan
- Dashboard beda tampilan sesuai role:
  - Super Admin/Pustakawan: statistik peminjaman, buku populer, keterlambatan, grafik kunjungan
  - Siswa: daftar buku yang sedang dipinjam, riwayat, denda aktif, rekomendasi buku
- Export laporan (PDF/Excel): laporan bulanan sirkulasi, denda, inventaris

### F. Fitur Tambahan (opsional/nice-to-have)
- Reservasi buku (booking jika sedang dipinjam)
- Ulasan & rating buku oleh anggota
- E-katalog dengan preview cover
- Mode offline scan (PWA/cache) untuk area dengan sinyal lemah

---

## 3. Struktur Database (Ringkas)

```
users (id, name, email, password, nis_nip, role_id, photo, member_qr_code, class_or_position)
roles, permissions, role_has_permissions, model_has_roles  -> (Spatie)
books (id, title, author, publisher, isbn, category_id, cover, description)
book_categories (id, name)
book_copies (id, book_id, inventory_code, qr_code, status[available/borrowed/lost/maintenance], shelf_location)
loans (id, user_id, book_copy_id, borrowed_at, due_date, returned_at, fine_amount, status)
fines (id, loan_id, amount, paid_status, paid_at)
settings (max_loan_days, max_books_per_user, fine_per_day)
notifications (standard Laravel table)
activity_logs (id, user_id, action, description, created_at) -> audit trail RBAC
```

---

## 4. Struktur API (Contoh Endpoint)

```
POST   /api/login
POST   /api/logout
GET    /api/me

# User Management (Admin)
GET    /api/users
POST   /api/users
PUT    /api/users/{id}
DELETE /api/users/{id}
POST   /api/users/import

# Buku
GET    /api/books
POST   /api/books
PUT    /api/books/{id}
DELETE /api/books/{id}
GET    /api/books/{id}/qr

# Sirkulasi
POST   /api/loans/borrow      { member_qr, book_qr }
POST   /api/loans/return      { book_qr }
GET    /api/loans/history
GET    /api/loans/active

# Dashboard
GET    /api/dashboard/stats
GET    /api/reports/export
```

Semua endpoint (kecuali login) dilindungi middleware `auth:sanctum` + `role:` / `permission:` dari Spatie.

---

## 5. Panduan UI/UX (Mobile-First)

- Desain **mobile-first**: layout dasar untuk layar ≤ 480px, baru dikembangkan ke tablet/desktop (breakpoint Tailwind: `sm`, `md`, `lg`)
- Navigasi utama: **bottom navigation bar** (ala app mobile) untuk role siswa; **sidebar collapsible** untuk admin/pustakawan di layar besar
- Tombol scan QR sebagai **Floating Action Button (FAB)** besar, mudah dijangkau ibu jari
- Kamera scan menggunakan `getUserMedia` (akses kamera HP langsung dari browser)
- Kartu anggota digital ditampilkan sebagai halaman full-screen QR (untuk discan pustakawan) + opsi simpan sebagai gambar
- Font & tap-target area cukup besar (minimal 44x44px) untuk kemudahan sentuh
- Gunakan skeleton loading & optimistic UI untuk koneksi lambat
- Dark mode opsional

---

## 6. Instruksi untuk AI/Developer

Silakan bangun aplikasi ini dengan urutan berikut:
1. Setup project Laravel (API only) + migrasi database sesuai struktur di atas
2. Install & konfigurasi `spatie/laravel-permission` + Sanctum
3. Buat seeder role & permission default (Super Admin, Pustakawan, Guru, Siswa)
4. Bangun endpoint API per modul (User, Buku, Sirkulasi, Dashboard)
5. Setup project React (Vite) dengan Tailwind, routing berbasis role
6. Implementasikan scan QR (kamera) di frontend & generate QR di backend
7. Bangun dashboard berbeda per role
8. Tambahkan validasi, error handling, dan unit test dasar untuk endpoint kritikal (login, borrow, return)

Prioritaskan: **RBAC aman**, **transaksi sirkulasi via QR tidak boleh gagal/duplikat**, dan **tampilan nyaman di layar HP**.
