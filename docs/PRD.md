# Product Requirements Document (PRD)

## Sholat Widget

| Field     | Value                              |
| --------- | ---------------------------------- |
| Versi     | 1.0                                |
| Tanggal   | 4 Juli 2026                        |
| Status    | MVP 1 — Tercapai                   |
| Penulis   | Tim Sholat Widget                  |
| Repo      | `sholat-widget` (Tauri v2 + React) |

---

## 1. Ringkasan Eksekutif

**Sholat Widget** adalah aplikasi desktop pengingat waktu sholat untuk pengguna
Muslim di Indonesia. Aplikasi berjalan di _system tray_, menampilkan jadwal
sholat harian dari Kemenag, dan memberi pengingat (notifikasi + suara bedug)
beberapa menit sebelum setiap waktu sholat masuk.

Aplikasi dibangun dengan **Tauri v2** (Rust) sebagai backend dan **React 19 +
TypeScript** sebagai frontend, menggabungkan kecepatan dan jejak memori kecil
aplikasi native dengan fleksibilitas UI web.

### Status saat ini

**MVP 1 telah tercapai.** Semua fitur inti yang diperlukan untuk pengalaman
pengingat sholat harian yang andal sudah berfungsi: deteksi lokasi, pengambilan
jadwal, scheduler background, pengingat multimedia, dan panel pengaturan.

> **Catatan ruang lingkup:** Fitur **arah kiblat (kompas Qibla)** sengaja
> **dikeluarkan dari roadmap** karena kompleksitas implementasi (memerlukan
> akses sensor magnetik/kompas perangkat yang tidak konsisten lintas-platform
> di Tauri, perhitungan trigonometri bearing, dan kalibrasi sensor yang
> tidak dapat diandalkan di desktop). Keputusan ini diambil agar fokus tetap
> pada kualitas core flow pengingat.

---

## 2. Latar Belakang & Masalah

### Masalah

Muslim di Indonesia perlu mengetahui waktu sholat tepat waktu setiap hari.
Waktu sholat berubah setiap hari dan bervariasi berdasarkan lokasi geografis.
Solusi yang ada saat ini:

- **Aplikasi mobile** — tidak selalu terlihat saat bekerja di komputer.
- **Website** — harus dibuka manual, tidak memberi notifikasi otomatis.
- **Notifikasi OS bawaan** — tidak ada di sebagian besar desktop.

### Solusi

Aplikasi desktop yang:

1. **Selalu aktif** di tray, tidak mengganggu alur kerja.
2. **Otomatis** mendeteksi lokasi dan mengambil jadwal.
3. **Proaktif** memberi pengingat sebelum waktu sholat (bukan hanya saat masuk).
4. **Akurat** menggunakan sinkronisasi waktu NTP, bukan mengandalkan jam sistem.

---

## 3. Tujuan & Metrik Keberhasilan

### Tujuan produk

| ID  | Tujuan                                                      | Prioritas |
| --- | ----------------------------------------------------------- | --------- |
| G1  | Pengguna tidak pernah melewatkan waktu sholat karena lupa   | Tinggi    |
| G2  | Pengingat muncul tepat waktu dengan akurasi < ±1 detik      | Tinggi    |
| G3  | Aplikasi ringan: jejak memori < 150 MB RAM saat idle        | Sedang    |
| G4  | Bekerja offline (jadwal di-cache untuk hari berjalan)       | Sedang    |
| G5  | Pengalaman onboarding < 60 detik                            | Sedang    |

### Metrik keberhasilan (MVP 1)

| Metrik                      | Target        | Cara ukur                        |
| --------------------------- | ------------- | -------------------------------- |
| Akurasi waktu pengingat     | < ±1 detik    | NTP drift log                    |
| Waktu onboarding selesai    | < 60 detik    | Manual testing                   |
| Penggunaan RAM idle         | < 150 MB      | Activity Monitor / Task Manager  |
| Cold start sampai tray aktif| < 3 detik     | Manual stopwatch                 |
| Rate notifikasi terkirim    | 100% (tidak ada miss) | Log scheduler + reminded flags |

---

## 4. Target Pengguna

### Persona utama

**Muslim profesional di Indonesia** yang menghabiskan sebagian besar waktu
di depan komputer (desktop/laptop), menggunakan macOS atau Windows.

### Kebutuhan pengguna

| ID  | Kebutuhan                                                |
| --- | -------------------------------------------------------- |
| U1  | Tahu kapan waktu sholat berikutnya tanpa membuka app     |
| U2  | Diperingatkan _sebelum_ waktu sholat agar sempat bersiap |
| U3  | Tidak perlu setup lokasi manual yang rumit               |
| U4  | Bisa membisukan pengingat saat tidak relevan             |
| U5  | Bekerja di zona waktu mana pun di Indonesia (WIB/WITA/WIT)|

---

## 5. Stack Teknologi

### Backend (Rust / Tauri v2)

| Komponen          | Teknologi                    | Fungsi                          |
| ----------------- | ---------------------------- | ------------------------------- |
| Framework         | Tauri v2.10                  | App shell, multi-window, IPC    |
| HTTP Client       | reqwest 0.12                 | API Kemenag & geolocation       |
| Audio             | rodio 0.20                   | Pemutar suara bedug             |
| Waktu             | rsntp 4 + chrono 0.4 + chrono-tz | NTP sync & konversi timezone |
| Scheduling        | tokio                        | Async runtime untuk scheduler   |
| Logging           | tauri-plugin-log + custom logger | File log rotasi harian       |
| Plugin            | tauri-plugin-notification    | Notifikasi native OS            |
| Plugin            | tauri-plugin-positioner      | Posisi popup relatif tray       |
| Plugin            | tauri-plugin-autostart       | Launch saat boot                |
| Plugin            | tauri-plugin-single-instance | Cegah multi-instance            |

### Frontend (React + TypeScript)

| Komponen          | Teknologi                    | Fungsi                          |
| ----------------- | ---------------------------- | ------------------------------- |
| Framework         | React 19                     | UI library                      |
| Build tool        | Vite 8                       | Dev server & bundler            |
| Styling           | Tailwind CSS v4              | Utility-first styling           |
| Komponen UI       | shadcn/react + Base UI       | Primitif UI (dialog, slider, dll)|
| Animasi           | Motion (Framer Motion)       | Animasi tray enter/exit         |
| Icons             | Lucide React                 | Icon set                        |
| Toast             | Sonner                       | Notifikasi in-app               |
| Font              | Geist Variable               | Tipografi                       |

### API Eksternal

| API                | Endpoint                           | Fungsi                        |
| ------------------ | ---------------------------------- | ----------------------------- |
| MyQuran v3         | `api.myquran.com/v3`               | Jadwal sholat & cari kota     |
| IP-API             | `ip-api.com/json/{ip}`             | Geolocate IP → koordinat + tz |

---

## 6. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                      Tauri Main Process (Rust)               │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │  Scheduler   │──▶│  Schedule    │──▶│  Reminder Engine │ │
│  │  (tokio loop)│   │  Cache       │   │  (audio + notify)│ │
│  │  30s interval│   │  (JSON disk) │   │                  │ │
│  └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘ │
│         │                  │                    │           │
│  ┌──────▼───────┐   ┌──────▼───────┐   ┌────────▼─────────┐ │
│  │ Time Service │   │  API Client  │   │  Audio Player    │ │
│  │ (NTP sync)   │   │  (reqwest)   │   │  (rodio + bedug) │ │
│  └──────────────┘   └──────────────┘   └──────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              IPC Commands (invoke_handler)               ││
│  │  get_config · save_settings · get_today_schedule ·       ││
│  │  complete_onboarding · search_cities · test_sound ·      ││
│  │  open/hide windows · get/close_reminder                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Windows: [tray] [main] [reminder]                           │
└────────────────────────────┬────────────────────────────────┘
                             │ Tauri IPC (invoke / emit)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    WebView Frontend (React)                  │
│                                                              │
│   useWindowLabel ──▶ renders one of:                        │
│     ├─ <TrayWindow />     (glass popup, 320×480)            │
│     ├─ <MainWindow />     (dashboard, 920×640)              │
│     ├─ <ReminderWindow /> (popup masuk waktu, 340×220)      │
│     └─ <Onboarding />     (4-step wizard, di tray window)   │
│                                                              │
│   Shared hooks: useConfig · useSchedule · useLiveClock      │
└─────────────────────────────────────────────────────────────┘
```

### Modul Rust

| Modul        | File           | Tanggung jawab                                    |
| ------------ | -------------- | ------------------------------------------------- |
| `lib.rs`     | Entry point    | App setup, tray, window management, IPC commands  |
| `scheduler`  | Scheduler      | Loop 30 detik, cek window pengingat, trigger      |
| `schedule`   | Schedule logic | Fetch & cache jadwal, prefetch besok, merge       |
| `time`       | Time service   | NTP sync, drift correction, timezone, window cek  |
| `api`        | API client     | MyQuran & IP-API endpoints                        |
| `location`   | Location       | Auto-detect (IP→geo→city) & manual resolve        |
| `city`       | City matching  | Fuzzy match nama kota, provinsi → timezone map    |
| `cache`      | Cache store    | Persist jadwal, reminded flags, cities ke disk    |
| `config`     | Config         | Load/save config.json                             |
| `audio`      | Audio player   | rodio playback bedug, volume/mute control         |
| `models`     | Data models    | Struct serde: City, JadwalEntry, PrayerKind, dll  |
| `logging`    | Logger         | File log rotasi 7 hari                            |

### Multi-window model

| Label       | Ukuran     | Fungsi                                  | Trigger                     |
| ----------- | ---------- | --------------------------------------- | --------------------------- |
| `tray`      | 320×480    | Quick view: jam, sholat berikutnya      | Klik kiri ikon tray         |
| `main`      | 920×640    | Dashboard penuh: semua jadwal, settings | Tombol "Buka Aplikasi"      |
| `reminder`  | 340×220    | Popup masuk waktu sholat                | Scheduler saat window aktif |

---

## 7. Fitur MVP 1 — Status: ✅ Tercapai

### 7.1 Onboarding (4 langkah)

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | Welcome screen                           | Penjelasan singkat fungsi widget                   |
| ✅     | Pemilihan lokasi                         | Auto (GPS/IP) atau Manual (cari kota)              |
| ✅     | Konfigurasi audio                        | Slider volume, test bunyi bedug, toggle mute       |
| ✅     | Selesai                                  | Konfirmasi & mulai                                 |
| ✅     | Stepper indikator progres                | Visual 4 langkah dengan checkmark                  |

### 7.2 Lokasi & Jadwal

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | Auto-detect lokasi via IP geolocation    | IP → koordinat → nama kota → Kemenag city ID       |
| ✅     | Manual city picker dengan search         | Query API `/sholat/kabkota/cari/{query}`           |
| ✅     | Fallback city list embedded              | `cities_fallback.json` untuk matching offline      |
| ✅     | Jadwal harian dari Kemenag (MyQuran API) | Subuh, Terbit, Dhuha, Dzuhur, Ashar, Maghrib, Isya |
| ✅     | Prefetch jadwal besok                    | Mencegah delay saat tengah malam ganti hari        |
| ✅     | Cache jadwal ke disk                     | `schedules.json` di config dir                     |
| ✅     | Timezone otomatis dari provinsi          | WIB / WITA / WIT mapping                           |
| ✅     | Refresh jadwal saat ganti hari/kota      | `needs_refresh` + `merge_jadwal` logic             |

### 7.3 Scheduler & Pengingat

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | Background scheduler loop (30 detik)     | `run_scheduler` di dedicated tokio runtime         |
| ✅     | Pengingat N menit sebelum sholat         | `reminder_offset_minutes` (default -5)             |
| ✅     | Window pengingat masuk waktu sholat      | Standalone `reminder` window (340×220, glass)      |
| ✅     | Notifikasi native OS                     | Fallback untuk layar mati / lock screen            |
| ✅     | Suara bedug (rodio)                      | `bedug.mp3`, volume & mute dari config             |
| ✅     | Dedup pengingat (reminded flags)         | HashSet `tanggal:PrayerKind`, cleanup harian       |
| ✅     | NTP time synchronization                 | `pool.ntp.org`, sync setiap 1 jam, drift correction|

### 7.4 UI / UX

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | Tray popup (glass, animated)             | Enter/exit dengan Motion, blur, always-on-top      |
| ✅     | Main window dashboard                    | Jam besar, countdown, semua jadwal, tombol aksi    |
| ✅     | Live clock (HH:MM:SS)                    | Polling `get_current_time` via IPC                 |
| ✅     | Countdown ke sholat berikutnya           | `findNextPrayer` + `formatCountdown`               |
| ✅     | Highlight sholat aktif berikutnya        | PrayerRow dengan state `active`                    |
| ✅     | Dark mode mengikuti sistem               | `prefers-color-scheme` media query                 |
| ✅     | Auto-hide tray saat blur (click-out)     | `tauri://blur` listener + animasi exit             |
| ✅     | Reduced motion support                   | `useReducedMotion` dari Motion                     |
| ✅     | Glassmorphism design system              | `.glass` utility, documented di `design_system.md` |

### 7.5 Pengaturan

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | Dialog Settings (dari tray & main)       | Sticky header/footer, scrollable body              |
| ✅     | Ubah lokasi (Auto / Manual)              | `LocationPicker` component                         |
| ✅     | Volume bedug slider                      | 0–100%, realtime persist                           |
| ✅     | Toggle mute                              | Switch                                                             |
| ✅     | Toggle auto-launch                       | `tauri-plugin-autostart`                           |
| ✅     | Hot-reload config lintas window          | `config-updated` event emit                        |

### 7.6 Sistem & Reliabilitas

| Status | Fitur                                    | Detail                                             |
| ------ | ---------------------------------------- | -------------------------------------------------- |
| ✅     | System tray icon + context menu          | Settings, Quit; klik kiri toggle tray              |
| ✅     | Single instance enforcement              | `tauri-plugin-single-instance`, focus running      |
| ✅     | Auto-launch saat boot                    | macOS LaunchAgent, configurable                    |
| ✅     | File logging dengan rotasi 7 hari        | Custom `Logger`, cleanup harian                    |
| ✅     | Graceful close (hide, bukan exit)        | `CloseRequested` → prevent_close → hide            |
| ✅     | macOS Accessory activation policy        | Tidak muncul di Dock, hanya tray                   |

---

## 8. Out of Scope

Fitur berikut **sengaja tidak masuk** MVP 1 atau dikeluarkan dari roadmap:

### 8.1 Dikeluarkan dari roadmap (tidak akan dikerjakan)

| Fitur               | Alasan                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| **Arah Kiblat**      | Sensor kompas desktop tidak konsisten lintas-platform di Tauri; kalibrasi tidak dapat diandalkan; kompleksitas tinggi untuk nilai yang terbatas. |
| **Widget desktop OS** (macOS Dashboard, Windows widget) | API platform-specific yang kompleks; tray popup sudah memadai. |

### 8.2 Ditangguhkan (mungkin di MVP 2+)

| Fitur               | Catatan                                                  |
| -------------------- | -------------------------------------------------------- |
| Adzan audio penuh    | Saat ini hanya bedug; rekaman adzan butuh lisensi        |
| Multi-bahasa (EN)   | Saat ini hardcode Bahasa Indonesia                       |
| Imsak notification   | Data sudah ada di API, belum ada trigger terpisah        |
| Hijri calendar view  | API MyQuran mendukung, belum di-integrasikan            |
| Sinkronisasi cloud  | Config saat ini local-only                               |
| Tema kustomisasi    | Saat ini hanya dark/light mengikuti sistem               |
| Notifikasi pre & post sholat terpisah | Saat ini satu offset untuk semua sholat    |

---

## 9. Struktur Data

### Config (`config.json`)

```jsonc
{
  "onboarding_done": true,            // bool — apakah onboarding selesai
  "location_mode": "Auto",            // "Auto" | "ManualCity"
  "city_id": "eda80a3d...",           // string — Kemenag city ID
  "city_name": "JAKARTA",             // string — display name
  "timezone": "Asia/Jakarta",         // string — IANA timezone
  "last_lat_long": [-6.2, 106.8],     // [f64,f64] | null — koordinat terakhir
  "volume": 0.7,                      // f32 — 0.0 sampai 1.0
  "muted": false,                     // bool — bisukan audio
  "reminder_offset_minutes": -5,      // i32 — menit sebelum sholat (negatif)
  "auto_launch": true                 // bool — start saat boot
}
```

### Schedule Cache (`cache/schedules.json`)

```jsonc
{
  "schedules": {
    "2026-07-04": {
      "tanggal": "Jumat, 04/07/2026",
      "imsak": "04:15",
      "subuh": "04:25",
      "terbit": "05:43",
      "dhuha": "06:12",
      "dzuhur": "11:40",
      "ashar": "14:59",
      "maghrib": "17:30",
      "isya": "18:44"
    }
  },
  "city_id": "eda80a3d..."
}
```

### Reminded Flags (`cache/reminded.json`)

```jsonc
{
  "reminded": [
    "2026-07-04:Subuh",
    "2026-07-04:Dzuhur"
  ]
}
```

---

## 10. Roadmap

### MVP 1 ✅ (Selesai)

> Lihat §7. Semua fitur inti tercapai dan berfungsi.

### MVP 2 — Polish & Stabilitas (Rencana)

| Prioritas | Fitur                                    | Estimasi |
| --------- | ---------------------------------------- | -------- |
| Tinggi    | Notifikasi Imsak (terpisah dari Subuh)   | 1 hari   |
| Tinggi    | Error recovery: retry API exponential bf | 1 hari   |
| Sedang    | Kalender Hijriyah di main window         | 2 hari   |
| Sedang    | Pengaturan offset per-sholat             | 1 hari   |
| Sedang    | Windows build testing & CI               | 2 hari   |
| Rendah    | Multi-bahasa (i18n EN toggle)            | 3 hari   |

### MVP 3 — Ekspansi (Eksplorasi)

| Fitur                                    | Catatan                                  |
| ---------------------------------------- | ---------------------------------------- |
| Widget desktop native (macOS/Windows)    | Butuh riset API platform                 |
| Pilihan sound pengingat (bedug/adzan/notif) | Paket audio dengan lisensi jelas       |
| Statistik konsistensi sholat             | Local-only, privacy-first                |
| Sinkronisasi config antar perangkat      | Butuh backend (opsional)                 |

---

## 11. Asumsi & Batasan

### Asumsi

1. API MyQuran (`api.myquran.com`) tetap gratis dan tersedia.
2. API IP-API (`ip-api.com`) tetap gratis untuk HTTP (non-HTTPS).
3. Pengguna memiliki koneksi internet saat pertama kali menjalankan app.
4. Jam OS pengguna mendekati akurat (NTP melakukan koreksi drift).
5. Target platform: macOS (utama) dan Windows.

### Batasan teknis

1. **Audio**: Hanya mendukung format yang didekode rodio (mp3, wav, ogg, flac).
2. **Geolocation**: Auto-detect menggunakan IP (bukan GPS), akurasi terbatas
   ke tingkat kota. Tidak ada akses GPS langsung di Tauri desktop.
3. **Notifikasi**: Bergantung pada permission sistem; jika ditolak, hanya
   jendela pengingat + suara yang aktif.
4. **Transparansi**: Memerlukan `macOSPrivateApi` di macOS; di Windows
   menggunakan compositor bawaan.

---

## 12. Risiko & Mitigasi

| Risiko                                  | Dampak | Kemungkinan | Mitigasi                                            |
| --------------------------------------- | ------ | ----------- | --------------------------------------------------- |
| API MyQuran down/rate-limited           | Tinggi | Sedang      | Cache jadwal disk (hari ini + besok); fallback city |
| NTP unreachable                         | Sedang | Rendah      | Fallback ke jam OS; drift log untuk monitoring      |
| IP-API tidak akurat (VPN/proxy)         | Sedang | Sedang      | Manual city picker sebagai alternatif               |
| Permission notifikasi ditolak           | Sedang | Sedang      | Jendela pengingat + suara tetap aktif sebagai backup|
| Audio device tidak tersedia             | Sedang | Rendah      | Graceful degradation: skip audio, tampilkan window  |
| OS sleep/hibernate saat waktu sholat    | Tinggi | Sedang      | Scheduler cek "reminded window" saat resume         |

---

## 13. Definisi Selesai (Definition of Done)

Sebuah fitur dianggap selesai jika:

- [ ] Implementasi lulus semua unit test (`cargo test`)
- [ ] Tidak ada error `oxlint` maupun `tsc`
- [ ] `bun run build` dan `cargo build` berhasil tanpa warning
- [ ] Fitur berfungsi di macOS (platform utama)
- [ ] Config ter-load/ter-save dengan benar (round-trip)
- [ ] Tidak ada regression pada flow existing
- [ ] Logging informatif untuk debugging

---

## 14. Lampiran

### A. Perintah development

```bash
# Frontend dev server
bun run dev

# Tauri dev (frontend + backend)
bun run tauri dev

# Build production
bun run build          # frontend
bun run tauri build    # full app

# Test
cargo test --manifest-path src-tauri/Cargo.toml
bun run lint
```

### B. Dokumen terkait

| Dokumen              | Lokasi                  | Isi                                |
| -------------------- | ----------------------- | ---------------------------------- |
| Design System        | `docs/design_system.md` | Token, komponen, glassmorphism spec|
| Source code          | `src/`                  | Frontend React                     |
| Source code          | `src-tauri/src/`        | Backend Rust                       |
| Config Tauri         | `src-tauri/tauri.conf.json` | Window definitions, bundle config |

### C. Glossary

| Istilah       | Artian                                                  |
| ------------- | ------------------------------------------------------- |
| Bedug         | Instrumen perkusi tradisional, digunakan sebagai suara pengingat sholat |
| Kemenag       | Kementerian Agama Republik Indonesia (sumber data jadwal)|
| WIB/WITA/WIT  | Waktu Indonesia Barat/Tengah/Timur (3 zona waktu)       |
| Imsak         | Waktu penanda berhentinya sahur (beberapa menit sebelum Subuh) |
| Tray          | System tray / menu bar icon area                        |
| NTP           | Network Time Protocol — sinkronisasi waktu via internet |
| Drift         | Perbedaan antara jam sistem dan waktu aktual            |
