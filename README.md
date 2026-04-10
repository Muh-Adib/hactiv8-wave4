# OmniDesk AI - Multi-Domain Agent

**OmniDesk AI** adalah aplikasi chatbot tingkat lanjut berbasis Node.js dan Google Gemini AI. Chatbot ini dirancang secara modular dan khusus dengan arsitektur *Multi-Domain Skill* agar asisten virtual Anda dapat melakukan aksi pintar secara dinamis *(Function Calling)* seperti mengecek stok gudang, pendaftaran pesanan, tracking resi kargo, dan reservasi meja restoran langsung dari prompt bahasa natural.

Dibuat secara komprehensif oleh **Muh. Adib (Hacktiv8 Wave 4)** dalam rangka eksplorasi mendalam terkait agen AI modular (*Agentic Framework*).

---

## 🌟 Fitur Utama

- **🧠 Arsitektur Mode Modular Multi-Domain**
  Aplikasi ini membagi *Function Calls* menjadi "Domain" spesifik (E-Commerce, Kargo, Restoran, Perbankan). Sistem akan melakukan filter *tool* secara langsung ke memori GenAI, sehingga mencegah bentrokan (*hallucination conflict*) antar fungsi (misal: AI tidak akan memakai tools "Cek Resi Kargo" saat mode E-Commerce sedang aktif).

- **🛡️ Sistem Failover Otomatis (Anti-Down)**
  Jika Model Utama (`gemini-2.5-flash`) mengalami Limit (*Quota Exhausted*, Error 429/503), server secara otomatis melakukan *blacklist* sementara selama 1 Menit, lalu langsung melempar request *(fallback)* ke model lapis kedua (seperti `gemini-2.5-flash-lite` atau `gemini-1.5-flash`). Zero downtime!

- **📄 Dukungan RAG (Retrieval-Augmented Generation)**
  Anda dapat mengunggah file teks spesifik / dokumen operasional bisnis (PDF & TXT). Dokumen akan diekstrak menggunakan memori sementara agar konteks AI semakin luas dan akurat menanggapi pedoman perusahaan *(SOP)*.

- **🎨 UI/UX Profesional (Glassmorphism)**
  Terintegrasi dengan Single Page Frontend (SPA) bersih yang memiliki *Onboarding Tutorial*, fitur Dark Mode *vibrant*, *typing indicators*, Mode Badge (*Skill Mode vs Web Search*).

---

## 📂 Struktur Proyek

```text
📦 hactiv8/
 ┣ 📂 core/
 ┃ ┗ 📜 router.js         # Inti Failover Engine, RAG parser, & LLM Connector
 ┣ 📂 public/             # Menyajikan static frontend (SPA Ready)
 ┃ ┣ 📜 index.html        # Antarmuka Utama (Onboarding & Chat)
 ┃ ┣ 📜 script.js         # State Management & Integrasi API Klien
 ┃ ┗ 📜 style.css         # Desain Estetik UI & Micro-animations
 ┣ 📂 routes/
 ┃ ┗ 📜 api.js            # Express API Endpoint (/api/chat, /settings, /config)
 ┣ 📂 skills/             # Folder Modul Plug-and-Play AI Tool
 ┃ ┣ 📜 ecommerce.js
 ┃ ┣ 📜 kargo.js
 ┃ ┣ 📜 restoran.js
 ┃ ┗ 📜 perbankan.js
 ┣ 📂 utils/
 ┃ ┗ 📜 logger.js         # Logging berbasis warna untuk Terminal Server
 ┣ 📜 server.js           # File Bootloader Server Express Node
 ┣ 📜 models.json         # Konfigurasi prioritas fallback urutan Model AI
 ┗ 📜 .env                # Simpan GEMINI_API_KEY Anda di sini
```

---

## 🚀 Panduan Instalasi (Development Lokal)

### Persyaratan Sistem
- Terinstal **Node.js** versi 18 atau lebih tinggi.
- API Key Google Gemini AI yang aktif.

### Langkah-langkah

1. **Clone & Masuk ke Folder**
   ```bash
   cd hactiv8
   ```

2. **Instal Dependensi**
   Program menggunakan package seperti `express`, `@google/genai`, `pdf-parse`, `multer`, dan `fuse.js`.
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**
   Ubah salinan atau buat file baru bernama `.env`. (Bisa disalin dari `.env.example`). Masukkan API Key Anda:
   ```env
   GEMINI_API_KEY=AIzaSy...
   PORT=3000
   ```

4. **Jalankan Aplikasi**
   ```bash
   npm start
   ```

5. **Akses ke Web:** Buka `http://localhost:3000` di peramban web (*browser*).

---

## ☁️ Catatan Skalabilitas & Deploy (*App URL Dinamis*)

Aplikasi ini **100% siap di-deploy** di platform PaaS *(seperti Vercel, Railway, atau Heroku)* tanpa perlu hard-coding HTTP sama sekali. 

File `public/script.js` diformulasikan *agnostic* dengan *Dynamic Path URL API*:
- Saat running lokal *(melalui klik file index `file://` secara langsung tanpa npm)*: Script memanjat otomatis ke `http://localhost:3000/api/...`
- Saat di *Production/Deployment*: Script memanjat menggunakan Relative Path asli `/api/...` yang langsung merujuk pada domain aktif (contoh: `https://cs-app.railway.app/api/chat`).

Cukup hubungkan GitHub Repo Anda ke layanan deployment pilihan, pastikan Anda mengeset *Environment Variable* `GEMINI_API_KEY`, lalu izinkan server mengalokasikan build pada script `npm start`!

---

## 🧪 Alur Simulasi / Percobaan RAG Dokumen

Untuk mendemonstrasikan kecerdasan agen dalam membaca Dokumen Perusahaan (RAG), kami telah menyiapkan 3 file di dalam folder `rag_docs/`:
1. `1_SOP_Retur_dan_Refund.txt`
2. `2_Kebijakan_Pengiriman_dan_Kendala.txt`
3. `3_Program_Loyalty_dan_Promo.txt`

**Langkah-langkah Percobaan:**
1. Jalankan aplikasi via `npm start` dan buka di Browser.
2. Tuntaskan / *Skip* Tutorial Awal.
3. Buka **Pengaturan** (Ikon ⚙️ di pojok kanan bawah layang).
4. Pastikan "Izinkan Web Search" dinonaktifkan (OFF) agar fokus ke Dokumen kita.
5. Pada menu **Upload Basis Pengetahuan RAG (PDF/TXT)**, pilih salah satu file di folder `rag_docs/` (Misal: `1_SOP_Retur_dan_Refund.txt`).
6. Klik **Simpan & Terapkan**.
7. Chat AI dengan pertanyaan jebakan. Contoh: *"Pesanan barang saya kurang satu bautnya pas di-unboxing, ini udah 4 hari berlalu dari pas nyampe, pengen refund dong."*
8. Amati bagaimana AI membalas secara profesional dan **langsung menolak retur** (karena di SOP tertulis jelas bahwa klaim maksimal hanya 3x24 jam dan butuh video unboxing). AI tidak akan berhalusinasi menyarankan hal lain!

*(Catatan: Saat ini sistem RAG didesain untuk menangani 1 Dokumen Aktif secara efisien untuk menghemat limit token pengiriman prompt. Jika Anda ingin memasukkan 3 file sekaligus, Anda cukup menggabungkan (copy-paste) ketiga teks tersebut ke dalam 1 file `.txt` master lalu mengunggahnya).*

---

💡 **Credit & Pemeliharaan**
Dibangun dan dikelola oleh **Muh. Adib** (Hacktiv8 Indonesia Wave 4). Jika proyek ini dijalankan dalam mode production/komersial tinggi yang menggunakan *heavy function call arrays*, sangat disarankan untuk mengatur model berbayar di `models.json` atau berintegrasi ke sistem Database SQL persisten sesungguhnya!
