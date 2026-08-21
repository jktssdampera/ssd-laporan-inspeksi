# Blueprint 01: SSD Inspection Report (Vercel + Supabase)

## 1. Objective
Dokumen ini adalah blueprint utama (SOP) untuk pengembangan dan pemeliharaan aplikasi "SSD Inspection Report". Aplikasi ini telah dimigrasikan dari arsitektur lokal (Local Storage / Vanilla) ke arsitektur Cloud-native (Vercel Serverless + Supabase PostgreSQL).

## 2. Architecture & Tech Stack
- **Frontend:** HTML, CSS, JavaScript (Vanilla) - Di-host di Vercel.
- **Backend/API:** Vercel Serverless Functions (`api/` folder).
- **Database:** Supabase (PostgreSQL) untuk menyimpan data inspeksi dan metadata file.
- **Storage:** Supabase Storage (Buckets) untuk menyimpan aset foto dan PDF laporan.
- **PDF Generation:** Client-side menggunakan `jsPDF` + `autoTable` di `js/pdf-export.js`.

## 3. Directory Structure
```
ssd-laporan-inspeksi-vercel/
├── api/                  # Vercel Serverless Functions (Node.js)
├── css/                  # Stylesheets
├── js/                   # Frontend Logic (form, state, pdf-export, supabase client)
├── index.html            # Halaman utama aplikasi
└── supabase_schema.sql   # Skema Supabase & RLS
```

## 4. Standard Operating Procedures (SOP)

### A. Pengembangan Frontend
- Semua logika UI dan state report dikelola di `js/storage.js` dan dirender oleh `js/form-renderer.js`.
- JANGAN menyimpan foto base64 berukuran besar secara persisten di LocalStorage karena batas 5MB browser. Gunakan upload langsung ke Supabase Storage, lalu simpan URL-nya.

### B. Pengembangan Backend (Serverless)
- Tambahkan endpoint baru di folder `api/`.
- Gunakan `@supabase/supabase-js` untuk koneksi database di backend jika diperlukan proses tersembunyi (seperti upload PDF ter-otentikasi).
- Gunakan environment variables (`process.env`) untuk key rahasia di backend, sedangkan frontend hanya menggunakan `SUPABASE_ANON_KEY`.

### C. Error Handling
- Ketika terjadi kegagalan sistem (seperti gagal upload/download PDF), Agent (Tier 2) harus langsung membaca console log atau stack trace.
- Perbaiki logika deterministik di file terkait, uji ulang (jika memungkinkan), dan catat perubahan di `walkthrough.md`.

## 5. Known Issues & Constraints
- CORS (Cross-Origin Resource Sharing) harus dikonfigurasi dengan benar di Supabase Storage agar gambar bisa di-load oleh `jsPDF` (`crossOrigin: "Anonymous"`).

---
*Blueprint ini bersifat dinamis. Agen AI wajib memperbarui dokumen ini jika ada perubahan arsitektur besar atau penemuan pola baru.*
