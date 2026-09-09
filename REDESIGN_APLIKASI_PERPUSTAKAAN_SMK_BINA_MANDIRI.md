# REDESIGN APLIKASI PERPUSTAKAAN SMK BINA MANDIRI

## 1. Nama Aplikasi

**Redesign Aplikasi Perpustakaan SMK Bina Mandiri**

Aplikasi ini merupakan sistem informasi perpustakaan sekolah yang digunakan untuk mengelola anggota perpustakaan, koleksi buku, data kelas, transaksi peminjaman dan pengembalian, kartu perpustakaan digital, serta laporan perpustakaan.

---

## 2. Tujuan Redesign

Redesign dilakukan untuk menghasilkan aplikasi perpustakaan yang:

- Modern dan profesional
- Mudah digunakan oleh siswa dan admin
- Responsive pada desktop, tablet, dan smartphone
- Memiliki alur pendaftaran siswa yang sederhana
- Menggunakan NIS sebagai username
- Menggunakan nomor HP sebagai password awal
- Otomatis membuat data anggota perpustakaan setelah siswa mendaftar
- Memiliki kartu perpustakaan digital
- Mendukung QR Code untuk identifikasi anggota dan buku
- Memudahkan proses peminjaman dan pengembalian
- Memiliki pengelolaan struktur kelas yang fleksibel
- Memiliki laporan dan statistik perpustakaan
- Aman dan siap digunakan dalam skala seluruh siswa SMK Bina Mandiri

---

# 3. Konsep Sistem

Sistem dibagi menjadi dua bagian utama:

### Portal Siswa

Digunakan siswa untuk:

- Registrasi
- Login
- Melihat profil
- Melihat kartu perpustakaan
- Mencari buku
- Melihat detail buku
- Melihat buku yang sedang dipinjam
- Melihat tanggal jatuh tempo
- Melihat riwayat peminjaman
- Melihat denda
- Mengubah password

### Dashboard Admin

Digunakan petugas/admin perpustakaan untuk:

- Mengelola siswa
- Mengelola anggota
- Mengelola tingkat
- Mengelola jurusan
- Mengelola kelas/rombel
- Mengelola buku
- Mengelola kategori buku
- Mengelola klasifikasi buku
- Mengelola rak
- Mengelola eksemplar buku
- Melakukan peminjaman
- Melakukan pengembalian
- Mengelola denda
- Melihat laporan
- Melihat statistik
- Mengelola user/admin

---

# 4. Role & Hak Akses

## 4.1 Super Admin

Memiliki seluruh akses sistem.

Fitur:

- Dashboard
- Kelola admin
- Kelola siswa
- Kelola anggota
- Kelola tingkat
- Kelola jurusan
- Kelola kelas
- Kelola buku
- Kelola kategori
- Kelola klasifikasi
- Kelola rak
- Kelola eksemplar
- Peminjaman
- Pengembalian
- Denda
- Laporan
- Pengaturan sistem
- Audit log

## 4.2 Admin Perpustakaan

Fitur:

- Dashboard
- Data anggota
- Data siswa
- Data buku
- Kategori buku
- Klasifikasi buku
- Rak buku
- Eksemplar buku
- Peminjaman
- Pengembalian
- Kartu perpustakaan
- Laporan

## 4.3 Siswa / Anggota

Fitur:

- Dashboard
- Profil
- Kartu perpustakaan
- Koleksi buku
- Detail buku
- Peminjaman saya
- Riwayat
- Denda
- Ubah password

---

# 5. Registrasi Siswa

Siswa dapat mendaftarkan diri melalui halaman:

**Daftar Anggota Perpustakaan**

Form:

- Nama Lengkap
- NIS
- Tingkatan
- Jurusan
- Kelas
- Nomor HP
- Password

### Aturan Username

**NIS otomatis menjadi username.**

Contoh:

```text
Nama     : Ahmad Fauzan
NIS      : 202600123
Kelas    : 10 TKJ A
No HP    : 081234567890
```

Username:

```text
202600123
```

Password awal:

```text
081234567890
```

Password harus disimpan menggunakan hashing.

NIS wajib unik.

---

# 6. Otomatisasi Setelah Registrasi

Setelah siswa berhasil mendaftar, sistem otomatis:

1. Membuat akun user
2. Membuat data siswa
3. Membuat anggota perpustakaan
4. Membuat nomor anggota
5. Membuat QR Code anggota
6. Membuat kartu perpustakaan digital
7. Menghubungkan anggota dengan kelas

Contoh nomor anggota:

```text
LIB-2026-000123
```

---

# 7. Struktur Tingkatan dan Kelas

Struktur pendidikan harus fleksibel.

## Tingkatan

Contoh:

- Kelas 10
- Kelas 11
- Kelas 12

## Jurusan

Contoh:

- TKJ
- TKR
- TSM
- DKV
- Akuntansi
- Teknik Ototronik

## Rombel / Kelas

Kombinasi:

```text
Tingkat + Jurusan + Rombel
```

Contoh:

```text
10 TKJ A
10 TKJ B
10 TKR A
10 TKR B
10 TSM A
11 TKJ A
11 TKJ B
12 TKJ A
12 TKJ B
```

Admin dapat:

- Tambah kelas
- Edit kelas
- Nonaktifkan kelas
- Mengatur tingkat
- Mengatur jurusan
- Mengatur rombel
- Memindahkan siswa ke kelas lain

Struktur tidak boleh hardcode agar dapat digunakan untuk tahun ajaran berikutnya.

---

# 8. Tahun Ajaran

Sistem harus mendukung tahun ajaran.

Contoh:

```text
2026/2027
2027/2028
2028/2029
```

Setiap siswa terhubung dengan tahun ajaran.

Hal ini memungkinkan sistem menyimpan histori kelas siswa.

Contoh:

```text
2026/2027 → 10 TKJ A
2027/2028 → 11 TKJ A
2028/2029 → 12 TKJ A
```

---

# 9. Kartu Perpustakaan Digital

Setiap anggota memiliki kartu perpustakaan digital.

Isi kartu:

- Logo SMK Bina Mandiri
- Nama sekolah
- Foto siswa
- Nama lengkap
- NIS
- Kelas
- Jurusan
- Nomor anggota
- QR Code
- Tahun ajaran
- Status anggota

Contoh:

```text
----------------------------------------
        SMK BINA MANDIRI
        KARTU PERPUSTAKAAN

             [ FOTO ]

Nama       : Ahmad Fauzan
NIS        : 202600123
Kelas      : 10 TKJ A
No Anggota : LIB-2026-000123

             [ QR CODE ]

        ANGGOTA PERPUSTAKAAN
----------------------------------------
```

Fitur:

- Lihat kartu
- Download kartu
- Print kartu

---

# 10. QR Code Anggota

Setiap anggota memiliki QR Code unik.

Contoh value:

```text
LIB-2026-000123
```

QR Code digunakan untuk:

- Identifikasi siswa
- Peminjaman
- Pengembalian
- Membuka data anggota

Alur:

```text
SCAN QR SISWA
      ↓
Data anggota muncul
      ↓
SCAN QR / BARCODE BUKU
      ↓
Buku ditambahkan
      ↓
Simpan transaksi
```

---

# 11. Manajemen Buku

Admin dapat mengelola koleksi buku.

Data buku:

- ID Buku
- ISBN
- Judul
- Penulis
- Penerbit
- Tahun Terbit
- Kategori
- Klasifikasi
- Rak
- Cover
- Deskripsi
- Jumlah Eksemplar
- Status

---

# 12. Sistem Eksemplar Buku

Gunakan sistem **book copies / eksemplar**.

Contoh:

```text
Judul:
Administrasi Infrastruktur Jaringan

Total:
5 eksemplar
```

Kode eksemplar:

```text
BK-00001
BK-00002
BK-00003
BK-00004
BK-00005
```

Jika BK-00001 dipinjam:

```text
Total     : 5
Tersedia  : 4
Dipinjam  : 1
```

Dengan sistem ini admin dapat mengetahui secara tepat buku fisik mana yang sedang dipinjam.

---

# 13. Kategori Buku

Admin dapat membuat kategori:

- Teknologi
- Komputer
- Jaringan
- Pemrograman
- Bahasa Indonesia
- Bahasa Inggris
- Matematika
- Produktif TKJ
- Produktif TKR
- Produktif TSM
- DKV
- Akuntansi
- Novel
- Fiksi
- Non-Fiksi
- Referensi

Kategori dapat ditambah dan diedit admin.

---

# 14. Klasifikasi Buku

Sediakan klasifikasi buku berbasis kode.

Contoh:

```text
000 - Karya Umum
100 - Filsafat
200 - Agama
300 - Ilmu Sosial
400 - Bahasa
500 - Sains
600 - Teknologi
700 - Seni
800 - Sastra
900 - Sejarah
```

Admin dapat menambahkan klasifikasi baru.

---

# 15. Rak Buku

Admin dapat mengelola lokasi rak.

Contoh:

```text
A-01
A-02
A-03
B-01
B-02
```

Data rak:

- Kode Rak
- Nama Rak
- Lokasi
- Keterangan
- Status

---

# 16. Pencarian Buku

Siswa dan admin dapat mencari buku berdasarkan:

- Judul
- Penulis
- ISBN
- Kategori
- Klasifikasi
- Jurusan
- Rak

Gunakan pencarian realtime, filter, sorting, dan pagination.

---

# 17. Detail Buku

Tampilkan:

- Cover
- Judul
- ISBN
- Penulis
- Penerbit
- Tahun terbit
- Kategori
- Klasifikasi
- Rak
- Jumlah eksemplar
- Jumlah tersedia
- Status
- Deskripsi

Status:

```text
TERSEDIA
DIPINJAM
TIDAK TERSEDIA
```

---

# 18. Peminjaman Buku

Peminjaman dilakukan oleh admin/petugas.

Alur:

```text
Admin membuka transaksi
        ↓
Scan QR anggota
        ↓
Data siswa muncul
        ↓
Scan QR / Barcode buku
        ↓
Sistem mengecek ketersediaan
        ↓
Buku masuk transaksi
        ↓
Tentukan tanggal jatuh tempo
        ↓
Simpan
```

Data transaksi:

- Nomor transaksi
- Anggota
- NIS
- Kelas
- Buku
- Eksemplar
- Tanggal pinjam
- Tanggal jatuh tempo
- Petugas
- Status

---

# 19. Pengembalian Buku

Alur:

```text
Scan QR anggota
atau
Scan QR buku
        ↓
Cari transaksi aktif
        ↓
Tampilkan detail peminjaman
        ↓
Hitung keterlambatan
        ↓
Hitung denda jika ada
        ↓
Proses pengembalian
        ↓
Stok kembali tersedia
```

Data:

- Tanggal pinjam
- Jatuh tempo
- Tanggal kembali
- Lama keterlambatan
- Denda
- Petugas
- Status

---

# 20. Denda

Sistem mendukung denda keterlambatan.

Contoh pengaturan:

```text
Denda per hari:
Rp1.000
```

Jika terlambat 3 hari:

```text
3 × Rp1.000 = Rp3.000
```

Denda dapat diaktifkan/nonaktifkan melalui pengaturan.

---

# 21. Dashboard Admin

Dashboard menampilkan statistik:

```text
TOTAL ANGGOTA
1.250

TOTAL BUKU
4.580

BUKU TERSEDIA
3.900

BUKU DIPINJAM
680

PEMINJAMAN HARI INI
45

PENGEMBALIAN HARI INI
32

TERLAMBAT
18
```

Grafik:

- Peminjaman per bulan
- Pengembalian per bulan
- Buku paling populer
- Anggota berdasarkan kelas
- Peminjaman berdasarkan jurusan

---

# 22. Dashboard Siswa

Tampilan:

```text
Halo, Ahmad 👋

Buku Sedang Dipinjam
2

Buku Terlambat
0

Total Riwayat Peminjaman
15
```

Menu:

- Dashboard
- Kartu Perpustakaan
- Koleksi Buku
- Peminjaman Saya
- Riwayat
- Profil
- Ubah Password
- Logout

---

# 23. Riwayat Peminjaman

Tampilkan:

| Buku | Tanggal Pinjam | Jatuh Tempo | Dikembalikan | Status |
|---|---|---|---|---|
| Dasar Jaringan | 01/09/26 | 08/09/26 | 07/09/26 | Selesai |
| Laravel Dasar | 05/09/26 | 12/09/26 | - | Dipinjam |

---

# 24. Import Data Siswa

Admin dapat import Excel/CSV.

Format:

```text
Nama | NIS | Tingkat | Jurusan | Kelas | No HP
```

Sistem:

1. Membaca file
2. Validasi data
3. Mengecek NIS duplikat
4. Mengecek kelas
5. Membuat akun siswa
6. Membuat anggota
7. Membuat nomor anggota
8. Membuat QR Code

---

# 25. Manajemen User

Admin dapat:

- Tambah user
- Edit user
- Reset password
- Aktif/nonaktif
- Hapus user
- Cari user
- Filter role
- Filter kelas
- Filter jurusan

---

# 26. Laporan

## Laporan Anggota

Filter:

- Tahun ajaran
- Tingkat
- Jurusan
- Kelas

## Laporan Buku

- Semua buku
- Buku tersedia
- Buku dipinjam
- Buku rusak
- Buku hilang

## Laporan Peminjaman

Filter:

- Hari
- Minggu
- Bulan
- Tahun
- Kelas
- Jurusan
- Siswa
- Buku

## Laporan Pengembalian

## Laporan Keterlambatan

## Laporan Denda

Output:

- PDF
- Excel
- Print

---

# 27. Notifikasi

Sistem menyediakan notifikasi:

- Peminjaman berhasil
- Pengembalian berhasil
- Mendekati jatuh tempo
- Buku terlambat
- Denda

Contoh:

```text
Pengingat

Buku "Laravel Dasar" harus dikembalikan
pada 12 September 2026.
```

---

# 28. Audit Log

Catat aktivitas penting:

- Login
- Logout
- Tambah buku
- Edit buku
- Hapus buku
- Tambah anggota
- Peminjaman
- Pengembalian
- Perubahan data
- Reset password

Data:

- User
- Aktivitas
- IP Address
- Waktu

---

# 29. Struktur Database

Gunakan database relational.

Minimal tabel:

```text
users
students
library_members
academic_years
levels
majors
classes
book_categories
book_classifications
book_shelves
books
book_copies
loans
loan_items
returns
fines
notifications
audit_logs
settings
```

Relasi:

```text
academic_years
      ↓
    levels
      ↓
    majors
      ↓
    classes
      ↓
   students
      ↓
library_members
      ↓
    loans
      ↓
 loan_items
      ↓
   returns
      ↓
    fines
```

Buku:

```text
book_categories
       ↓
books
       ↓
book_copies
       ↓
book_shelves
```

Gunakan:

- Foreign key
- Indexing
- Unique constraint
- Database transaction
- Soft delete jika diperlukan

Field penting seperti NIS, nomor anggota, ISBN, kode buku, dan kode QR harus memiliki unique constraint sesuai kebutuhan.

---

# 30. Konsep UI/UX Redesign

Gunakan desain:

- Modern
- Clean
- Profesional
- Minimalis
- Educational
- Responsive
- Mobile friendly

Identitas warna:

- Navy
- Biru
- Merah
- Putih

Gunakan komponen:

- Sidebar
- Navbar
- Dashboard card
- Data table
- Search
- Filter
- Pagination
- Modal
- Dropdown
- Toast notification
- Confirmation dialog
- Empty state
- Loading state
- Skeleton loading

---

# 31. Struktur Menu Admin

```text
DASHBOARD

MASTER DATA
├── Tahun Ajaran
├── Tingkatan
├── Jurusan
├── Kelas
├── Siswa
└── Anggota Perpustakaan

KOLEKSI BUKU
├── Buku
├── Eksemplar
├── Kategori
├── Klasifikasi
└── Rak

TRANSAKSI
├── Peminjaman
├── Pengembalian
├── Sedang Dipinjam
├── Terlambat
└── Denda

LAPORAN
├── Anggota
├── Buku
├── Peminjaman
├── Pengembalian
├── Keterlambatan
└── Denda

SISTEM
├── User Admin
├── Audit Log
└── Pengaturan
```

---

# 32. Struktur Menu Siswa

```text
DASHBOARD

PERPUSTAKAAN
├── Koleksi Buku
├── Detail Buku
└── Kartu Perpustakaan

TRANSAKSI SAYA
├── Sedang Dipinjam
├── Terlambat
└── Riwayat

AKUN
├── Profil
├── Ubah Password
└── Logout
```

---

# 33. Teknologi yang Direkomendasikan

## Backend

Laravel

## Frontend

Vue.js / Nuxt.js

## Database

MySQL

## Authentication

Laravel Sanctum atau session authentication.

## Styling

Tailwind CSS.

## QR Code

Gunakan library QR Code yang stabil dan kompatibel dengan Laravel/Vue/Nuxt.

## API

Jika frontend dan backend dipisahkan, gunakan REST API dengan struktur response yang konsisten.

---

# 34. Keamanan

Implementasikan:

- Password hashing
- Authentication
- Authorization berdasarkan role
- CSRF protection
- Validation
- SQL injection protection
- Rate limiting login
- Session management
- Audit log
- Unique constraint
- Database transaction
- File upload validation
- Pembatasan akses berdasarkan role

---

# 35. Alur Lengkap Sistem

## Siswa

```text
Daftar
 ↓
Isi data
 ↓
Validasi
 ↓
Akun dibuat
 ↓
Anggota dibuat
 ↓
Nomor anggota dibuat
 ↓
QR Code dibuat
 ↓
Kartu perpustakaan dibuat
 ↓
Login
 ↓
Cari buku
 ↓
Admin melakukan peminjaman
 ↓
Siswa melihat status
 ↓
Pengembalian
 ↓
Riwayat tersimpan
```

## Admin

```text
Login
 ↓
Dashboard
 ↓
Kelola tahun ajaran
 ↓
Kelola tingkat
 ↓
Kelola jurusan
 ↓
Kelola kelas
 ↓
Kelola siswa
 ↓
Kelola anggota
 ↓
Kelola buku
 ↓
Kelola kategori
 ↓
Kelola klasifikasi
 ↓
Kelola rak
 ↓
Kelola eksemplar
 ↓
Peminjaman
 ↓
Pengembalian
 ↓
Laporan
```

---

# 36. Fitur Pengembangan Lanjutan

Aplikasi harus disiapkan agar dapat dikembangkan dengan fitur:

- Scan QR menggunakan kamera smartphone
- Cetak kartu anggota secara massal
- Cetak label QR buku
- Import buku dari Excel
- Export data
- Statistik per kelas
- Statistik per jurusan
- Ranking buku terpopuler
- Ranking anggota aktif
- Notifikasi jatuh tempo
- WhatsApp notification melalui integrasi pihak ketiga
- Backup database
- Multi-admin
- Pengaturan lama peminjaman
- Pengaturan maksimal jumlah buku yang dapat dipinjam

---

# 37. Prinsip Redesign

Prioritaskan:

### 1. Simpel

Siswa tidak membutuhkan banyak langkah untuk menggunakan aplikasi.

### 2. Cepat

Pencarian buku dan transaksi harus responsif.

### 3. Akurat

Stok buku harus selalu sesuai dengan kondisi transaksi.

### 4. Terstruktur

Data siswa, kelas, buku dan transaksi memiliki relasi yang jelas.

### 5. Fleksibel

Struktur kelas dan tahun ajaran dapat berubah tanpa mengubah source code.

### 6. Aman

Data akun dan transaksi harus terlindungi.

### 7. Siap Dikembangkan

Arsitektur harus memungkinkan penambahan fitur di masa depan.

---

# 38. Target Akhir

Hasil akhir redesign harus berupa aplikasi perpustakaan sekolah yang dapat digunakan secara nyata oleh:

- Siswa
- Admin perpustakaan
- Super Admin

Sistem harus mampu mengelola seluruh siklus:

```text
SISWA
  ↓
REGISTRASI
  ↓
ANGGOTA PERPUSTAKAAN
  ↓
KARTU + QR CODE
  ↓
KOLEKSI BUKU
  ↓
PEMINJAMAN
  ↓
JATUH TEMPO
  ↓
PENGEMBALIAN
  ↓
DENDA
  ↓
RIWAYAT
  ↓
LAPORAN
```

Aplikasi harus dibangun sebagai sistem yang siap digunakan di lingkungan **SMK Bina Mandiri**, bukan sekadar prototype atau tampilan mockup.
