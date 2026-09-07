# Konsep Aplikasi Manajemen Perpustakaan Digital

> Dokumen konsep berdasarkan `prompt-aplikasi-perpustakaan.md`  
> Fokus: MVP mobile-first, RBAC aman, dan sirkulasi QR yang konsisten.

## 1. Ringkasan Produk

Aplikasi ini adalah sistem manajemen perpustakaan sekolah/kampus berbasis web SPA yang membantu pustakawan mengelola anggota, katalog, inventaris fisik, peminjaman, pengembalian, denda, dan laporan. Anggota dapat melihat kartu digital, katalog, pinjaman aktif, riwayat, denda, serta notifikasi melalui ponsel.

**Masalah yang diselesaikan:**
- Transaksi manual lambat dan rawan salah catat.
- Stok judul sering tidak sesuai dengan kondisi tiap eksemplar.
- Hak akses antarpetugas dan anggota belum terkontrol.
- Anggota sulit memantau jatuh tempo dan riwayat pinjaman.
- Pembuatan laporan membutuhkan rekap manual.

**Nilai utama produk:** transaksi scan cepat, data inventaris akurat, akses sesuai kewenangan, dan pengalaman mobile yang sederhana.

## 2. Sasaran dan Indikator Keberhasilan

- Peminjaman/pengembalian normal dapat diproses dalam maksimal 30 detik.
- Tidak ada dua pinjaman aktif untuk eksemplar yang sama.
- Semua perubahan data penting memiliki jejak audit.
- Anggota dapat mengetahui pinjaman dan denda aktif tanpa bertanya kepada petugas.
- Laporan periodik dapat dihasilkan tanpa rekap manual.
- Minimal 95% transaksi scan berhasil pada perangkat/browser yang didukung.

## 3. Pengguna dan Peran

| Peran | Tujuan utama |
|---|---|
| Super Admin | Mengelola konfigurasi global, role/permission, seluruh data, dan audit |
| Pustakawan | Mengelola anggota, katalog, inventaris, sirkulasi, denda, dan laporan |
| Guru/Staff | Memakai layanan anggota dengan aturan pinjaman sesuai tipe pengguna |
| Siswa/Anggota | Mencari buku dan melihat kartu, pinjaman, riwayat, denda, notifikasi |

Istilah role distandarkan menjadi `super_admin`, `librarian`, `staff`, dan `student`. Guru/Staff dan Siswa sama-sama anggota, tetapi dapat memiliki kebijakan pinjaman berbeda.

## 4. Ruang Lingkup

### MVP (wajib)
1. Autentikasi Sanctum, lupa/reset password, dan RBAC granular.
2. CRUD serta impor CSV/XLSX pengguna dengan validasi dan laporan kegagalan baris.
3. Profil dan kartu anggota digital dengan QR token acak.
4. CRUD kategori, judul buku, dan eksemplar fisik.
5. QR unik per eksemplar, lokasi rak, status, dan cetak label PDF.
6. Peminjaman dan pengembalian melalui scan dengan fallback input kode.
7. Perhitungan denda, pencatatan pembayaran, dan riwayat transaksi.
8. Dashboard sesuai role, notifikasi H-1, audit log, dan ekspor laporan.
9. Pengaturan aturan pinjam per tipe anggota.

### Fase lanjutan
Reservasi, perpanjangan mandiri, ulasan/rating, rekomendasi berbasis histori, PWA/offline queue, WhatsApp, dark mode, dan penanganan buku rusak/hilang yang lebih lengkap.

### Di luar MVP
E-book berlisensi/DRM, pembayaran online, integrasi akademik, multi-cabang kompleks, dan sinkronisasi offline penuh.

## 5. Matriks Hak Akses Awal

| Modul/Aksi | Super Admin | Pustakawan | Guru/Staff | Siswa |
|---|:---:|:---:|:---:|:---:|
| Role, permission, konfigurasi global | CRUD | - | - | - |
| Pengguna | CRUD | CRU | Baca diri | Baca diri |
| Kategori/judul/eksemplar | CRUD | CRUD | Baca | Baca |
| Peminjaman/pengembalian | Semua | Proses | Baca milik sendiri | Baca milik sendiri |
| Denda/pembayaran | Semua | Kelola | Baca milik sendiri | Baca milik sendiri |
| Laporan | Semua | Operasional | - | - |
| Audit log | Baca | Baca aktivitas relevan | - | - |
| Pengaturan aturan pinjam | CRUD | Baca | - | - |

Penghapusan pengguna, judul, atau eksemplar yang sudah memiliki histori dilakukan dengan **soft delete**, bukan menghilangkan histori. Setiap endpoint juga memeriksa cakupan data; permission `read` tidak otomatis memberi akses ke data milik pengguna lain.

## 6. Alur Bisnis Kritis

### 6.1 Peminjaman
1. Pustakawan membuka sesi transaksi dan memindai kartu anggota.
2. Server memvalidasi token anggota, status aktif, kuota, pinjaman terlambat, dan aturan role.
3. Pustakawan memindai satu atau lebih QR eksemplar.
4. Server memastikan eksemplar aktif dan berstatus `available`.
5. Saat dikonfirmasi, server mengunci baris eksemplar, membuat loan, menetapkan jatuh tempo, dan mengubah status menjadi `borrowed` dalam satu database transaction.
6. Server mengembalikan ringkasan transaksi; kegagalan tidak boleh meninggalkan perubahan parsial.

### 6.2 Pengembalian
1. Pustakawan memindai QR eksemplar.
2. Server mencari satu loan aktif dan mengunci datanya.
3. Server menghitung hari terlambat serta denda berdasarkan snapshot aturan saat transaksi.
4. Server mengisi waktu kembali, mengubah loan menjadi `returned`, membuat denda bila perlu, dan mengembalikan eksemplar ke `available` secara atomik.
5. Jika QR tidak dikenal, tidak sedang dipinjam, atau sudah dikembalikan, sistem menolak dengan pesan yang jelas.

### 6.3 Pembayaran denda
1. Pustakawan memilih denda aktif dan memasukkan nominal pembayaran.
2. Sistem mencatat petugas, waktu, metode, dan nominal; pembayaran tidak boleh melebihi sisa denda.
3. Denda berubah menjadi `paid` hanya ketika sisa bernilai nol; koreksi menggunakan reversal/audit, bukan menghapus catatan.

### 6.4 Pencegahan duplikasi
- `book_copies.inventory_code`, `book_copies.qr_token`, dan `users.member_qr_token` harus unik.
- Satu eksemplar hanya boleh mempunyai satu loan aktif melalui constraint/locking yang sesuai.
- Endpoint borrow/return menerima `idempotency_key` untuk retry jaringan.
- UI menahan scan berikutnya sampai respons sebelumnya selesai dan mengabaikan kode yang sama dalam jeda singkat.
- Server selalu menjadi sumber kebenaran; transaksi kritis tidak memakai optimistic success.

## 7. Aturan Bisnis Awal

- Nilai default yang disarankan: siswa 2 buku/7 hari, guru/staff 5 buku/14 hari; semuanya dapat dikonfigurasi.
- Denda dihitung per hari kalender setelah `due_date`, default Rp1.000/hari/eksemplar.
- `due_date` dan tarif denda disimpan sebagai snapshot pada loan agar perubahan pengaturan tidak mengubah histori.
- Anggota nonaktif, melewati kuota, atau memiliki pinjaman terlambat tidak dapat meminjam.
- Kebijakan blokir karena denda memiliki ambang nominal yang dapat dikonfigurasi.
- ISBN mengidentifikasi edisi/judul, sedangkan kode inventaris mengidentifikasi eksemplar fisik.
- Stok tidak disimpan sebagai angka manual; tersedia/dipinjam dihitung dari status eksemplar.

## 8. Status Domain

**BookCopy:** `available → borrowed → available`; petugas dapat mengubah `available → maintenance/lost`, tetapi eksemplar yang sedang dipinjam tidak dapat langsung diubah tanpa penyelesaian loan.

**Loan:** `active → returned` atau `active → overdue → returned`. Status `overdue` dapat diturunkan dari waktu, tetapi boleh disimpan oleh scheduler untuk pelaporan. Transaksi tidak dihapus; koreksi dicatat melalui audit.

**Fine:** `unpaid → partial → paid`; pembatalan administratif menjadi `waived` dengan alasan dan otorisasi.

**User:** `active → suspended/inactive`; pengguna nonaktif tetap mempertahankan histori.

## 9. Model Data Konseptual

- `users`: identitas, email, password, NIS/NIP, tipe anggota, kelas/jabatan, kontak, foto, status, member QR token.
- `roles`, `permissions`, tabel pivot Spatie: otorisasi granular.
- `book_categories`: klasifikasi katalog.
- `books`: metadata bibliografis tanpa stok manual.
- `book_copies`: kode inventaris, QR token, rak, kondisi, dan status eksemplar.
- `loans`: anggota, eksemplar, waktu pinjam/jatuh tempo/kembali, snapshot aturan, status.
- `fines`: nilai denda, nilai terbayar, status, alasan waiver.
- `fine_payments`: nominal, metode, petugas, waktu, referensi/reversal.
- `loan_policies`: batas jumlah, durasi, tarif, ambang blokir per tipe anggota.
- `notifications`: notifikasi in-app/email dan status baca/kirim.
- `activity_logs`: aktor, aksi, subject, perubahan sebelum/sesudah, IP, waktu.
- `import_jobs` dan `import_failures`: hasil impor serta error per baris.
- `idempotency_keys`: identitas request kritis dan respons tersimpan sementara.

Relasi inti: satu Book memiliki banyak BookCopy; satu User memiliki banyak Loan; satu BookCopy memiliki banyak histori Loan tetapi maksimal satu yang aktif; satu Loan dapat memiliki satu Fine dan Fine memiliki banyak FinePayment.

## 10. Arsitektur Sistem

```text
React SPA (mobile-first)
        │ HTTPS + JSON / Sanctum
Laravel 12 REST API
        ├── Auth & RBAC
        ├── Catalog & Inventory
        ├── Circulation Service
        ├── Reporting
        ├── Queue/Scheduler → email & reminder H-1
        └── Storage → cover, foto, PDF label
               │
             MySQL 8
```

- Frontend: React + Vite, React Router, Tailwind, dan Zustand untuk state UI/session ringan.
- Backend: controller tipis, Form Request validation, Policy/Permission, service transaksi sirkulasi, Resource response, job queue, dan scheduler.
- Sanctum menggunakan **stateful cookie authentication** bila SPA dan API berada dalam satu site/domain; HTTPS, CSRF, CORS allowlist, dan secure cookie wajib di produksi.
- QR berisi token acak opaque, bukan ID database. Token anggota dapat dirotasi/dicabut; data pribadi tidak ditanam dalam QR.
- File divalidasi berdasarkan MIME, ukuran, dan ekstensi; nama file dibuat server-side.
- Laporan besar dan impor diproses melalui queue agar request web tidak timeout.

## 11. Struktur Frontend Konseptual

**Siswa/Guru/Staff:** Login, Beranda, Katalog, Detail Buku, Pinjaman, Riwayat, Denda, Notifikasi, Kartu Anggota, dan Profil. Navigasi utama menggunakan bottom bar.

**Pustakawan/Admin:** Dashboard, Scan, Anggota, Buku, Eksemplar, Sirkulasi, Denda, Laporan, Pengaturan, dan Audit. Desktop memakai sidebar collapsible; mobile memakai bottom navigation/menu ringkas dengan FAB Scan.

Layar scan wajib memiliki izin kamera, pemilih kamera, bingkai scan, bunyi/getar opsional, status proses, hasil jelas, tombol ulang, serta input kode manual sebagai fallback. Semua layar menyediakan state loading, kosong, error, dan akses ditolak. Target sentuh minimal 44×44 px.

## 12. Kelompok API

- `/auth`: login, logout, me, forgot/reset password.
- `/users`, `/roles`, `/permissions`: pengguna dan otorisasi.
- `/imports/users`: unggah, preview/validasi, konfirmasi, hasil.
- `/categories`, `/books`, `/book-copies`: katalog dan inventaris.
- `/circulation/borrow-sessions`, `/loans/borrow`, `/loans/return`: transaksi scan.
- `/fines`, `/fine-payments`: denda dan pembayaran.
- `/dashboard`, `/reports`: ringkasan dan ekspor.
- `/settings/loan-policies`, `/notifications`, `/activity-logs`: operasional sistem.

Semua daftar memakai pagination, pencarian, filter, dan sorting yang dibatasi. Respons error memiliki format konsisten: `code`, `message`, `errors`, dan `request_id`. Kontrak final sebaiknya ditulis sebagai OpenAPI sebelum implementasi endpoint.

## 13. Keamanan dan Kebutuhan Nonfungsional

- Semua akses produksi melalui HTTPS; kamera browser juga memerlukannya.
- Password di-hash, login di-rate-limit, sesi dapat dicabut, dan aktivitas sensitif diaudit.
- Otorisasi dijalankan di server pada setiap request, bukan hanya menyembunyikan menu frontend.
- Database transaction dan row locking digunakan untuk borrow, return, dan pembayaran.
- Backup database dan file dilakukan terjadwal serta diuji proses restore-nya.
- Zona waktu aplikasi ditetapkan eksplisit; seluruh timestamp disimpan konsisten.
- Target awal respons baca p95 <500 ms dan transaksi p95 <1,5 detik di luar ekspor/impor.
- Browser target: dua versi terbaru Chrome/Edge/Firefox dan Safari iOS; input manual menjadi fallback perangkat tanpa kamera.
- Log tidak boleh menyimpan password, token, QR token utuh, atau data sensitif yang tidak diperlukan.
- Audit log bersifat append-only dan memiliki kebijakan retensi.

## 14. Tahapan Implementasi

1. Fondasi Laravel/React, environment, autentikasi, dan RBAC.
2. User, profil, impor, serta kartu anggota.
3. Kategori, judul, eksemplar, QR, dan label.
4. Sirkulasi atomik, idempotensi, denda, dan pembayaran.
5. Portal anggota, notifikasi, dashboard, dan laporan.
6. Audit, hardening keamanan, pengujian alur kritis, UAT, dan deployment.

## 15. Kriteria Penerimaan MVP

- Pengguna hanya melihat dan menjalankan aksi sesuai role, permission, serta cakupan datanya.
- Pustakawan dapat meminjamkan beberapa eksemplar kepada anggota yang valid melalui kamera atau input manual.
- Scan/retry ganda tidak membuat loan, return, atau pembayaran ganda.
- Dua petugas yang memproses eksemplar sama secara bersamaan menghasilkan tepat satu transaksi berhasil.
- Pengembalian memperbarui loan dan status eksemplar serta menghitung denda secara konsisten.
- Anggota hanya dapat melihat kartu dan data transaksi miliknya.
- Impor menampilkan preview, menolak data invalid, dan menghasilkan laporan error per baris.
- QR tidak mengekspos ID/data pribadi dan dapat dirotasi bila bocor.
- Ekspor laporan mengikuti filter periode serta permission pengguna.
- Seluruh aksi CRUD penting, transaksi, waiver, dan perubahan konfigurasi tercatat di audit log.

## 16. Keputusan yang Masih Perlu Dikonfirmasi

1. Aplikasi ditujukan untuk sekolah, kampus, atau harus mendukung keduanya sejak awal?
2. Apakah pustakawan boleh membuat/menghapus akun dan mengubah aturan pinjaman?
3. Apakah denda dibayar tunai saja atau perlu metode lain dan bukti bayar?
4. Apakah hari libur memengaruhi jatuh tempo/perhitungan denda?
5. Apakah perpanjangan, buku rusak/hilang, dan reservasi masuk MVP?
6. Apakah grafik kunjungan membutuhkan check-in pengunjung? Jika tidak, metrik diganti menjadi aktivitas sirkulasi.
7. Berapa skala target pengguna, judul, eksemplar, dan transaksi harian?
8. Kanal notifikasi wajib: in-app saja, email, atau WhatsApp?
9. Apakah deployment frontend/API satu domain atau berbeda domain?
10. Siapa yang berwenang melakukan waiver/koreksi denda dan transaksi?

## 17. Risiko Utama dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Double scan atau retry jaringan | Idempotency key, debounce scanner, transaction, unique constraint |
| Dua petugas meminjamkan buku sama | Row locking dan validasi status di dalam transaction |
| QR anggota disalin | Token acak dapat dirotasi, tampilkan identitas/foto saat scan |
| Stok tidak konsisten | Hitung dari eksemplar; jangan simpan stok manual |
| Akses data lintas anggota | Policy server-side dan pengujian permission matrix |
| Kamera gagal/izin ditolak | Input kode manual dan pesan pemulihan yang jelas |
| Impor besar gagal sebagian | Preview, queue, pencatatan error per baris, operasi idempoten |
| Histori hilang akibat delete | Soft delete dan audit append-only |

Dokumen ini menjadi konsep produk dan dasar penyusunan artefak lanjutan: requirement detail, ERD fisik, wireframe, OpenAPI, migration plan, serta skenario UAT.

## 18. Status Implementasi MVP

MVP telah selesai diimplementasikan pada workspace ini dengan cakupan:

- Auth Sanctum, reset password, RBAC empat role, dan matriks permission yang dapat dikelola.
- CRUD pengguna, profil/foto, kartu anggota QR, rotasi token, serta impor CSV/XLSX dengan laporan kegagalan baris.
- CRUD kategori, buku/cover, eksemplar, lokasi/status, QR unik, lookup kode, dan label PDF.
- Scanner kamera browser, fallback NIS/NIP/kode inventaris, transaksi atomik, row locking, dan idempotensi bertanda fingerprint.
- Peminjaman, pengembalian, histori, denda, pembayaran parsial/lunas, waiver, dan ledger pembayaran.
- Dashboard sesuai role, rekomendasi, statistik buku populer, dan aktivitas enam bulan.
- Notifikasi database/email H-1, scheduler status overdue, audit log append-only, dan pembersihan idempotency key.
- Laporan sirkulasi, denda, dan inventaris dalam CSV, XLSX, serta PDF.
- Pengaturan kebijakan per tipe anggota, portal anggota, route guard, mobile bottom navigation, dan admin sidebar.

Validasi akhir: 9 test backend dengan 35 assertion lulus, Laravel Pint lulus, ESLint lulus, build produksi Vite lulus, serta audit Composer/npm tidak menemukan vulnerability. Fitur fase lanjutan yang tetap di luar MVP: reservasi, ulasan/rating, WhatsApp, dark mode, dan offline PWA penuh.
