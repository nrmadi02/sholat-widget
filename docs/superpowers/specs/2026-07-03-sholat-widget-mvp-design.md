# PRD: Sholat Widget MVP

**Tanggal:** 2026-07-03
**Status:** Draft
**Platform:** macOS, Windows

---

## 1. Ringkasan Produk

Widget desktop pengingat sholat untuk Mac & Windows yang berjalan di system tray. Menggunakan API myquran.com v3 untuk jadwal sholat, mendeteksi lokasi secara otomatis via IP geolocation (dengan fallback manual), memainkan bunyi bedug kustom 5 menit sebelum setiap sholat, dan menampilkan popup window otomatis sebagai pengingat.

**Dibangun dengan:** Tauri (Rust backend + React frontend via webview native OS, bukan Electron/Chromium bundling).

### Target pengguna
Pengguna Muslim di Indonesia yang ingin pengingat sholat non-intrusif di desktop, yang tetap akurat walau timezone device tidak dipercaya.

### Tujuan MVP
1. Pengingat sholat yang akurat dan andal (tidak bergantung pada jam device yang benar)
2. Minimal friksi setup (auto-detect lokasi + onboarding singkat)
3. Ringan (binary kecil, hemat resource)
4. Cross-platform Mac & Windows dengan satu codebase

---

## 2. Kebutuhan Fungsional

### 2.1 System Tray & Popup
- Icon mesjid di system tray (macOS menu bar / Windows system tray)
- Klik icon tray → popup window kecil menampilkan jadwal sholat + jam berjalan
- Popup window bersifat always-on-top saat muncul, bisa ditutup user
- Auto-launch saat OS boot (opsional, default aktif)

### 2.2 Deteksi Lokasi
Tiga mode yang bermuara ke `cityId` (kabko ID dari API myquran):

| Mode | Cara kerja |
|---|---|
| **Auto (utama)** | IP → ip-api.com → `{lat, lon, city, timezone}` → search cityId via myquran |
| **Manual pilih** | User pilih dari list `/sholat/kabkota/semua` (cache lokal) |
| **Manual cari** | User ketik nama kota → `/sholat/kabkota/cari/{query}` |

Default: Auto. User bisa override ke manual kapan saja di Settings.

### 2.3 Pengingat Sholat
- Pengingat dimainkan **5 menit sebelum** setiap dari 5 sholat (Subuh, Dzuhur, Ashar, Maghrib, Isya)
- Saat trigger: bunyi bedug + popup window otomatis muncul
- Popup menampilkan: nama sholat, waktu sholat, countdown
- Anti double-trigger: flag per sholat per hari
- Sholat yang sudah lewat waktunya tidak di-trigger (skip)

### 2.4 Audio & Volume
- File bedug dibundel di `assets/sounds/` (format mp3/wav)
- Volume slider app-level (0.0–1.0) — **tidak menyentuh volume sistem**
- Mute toggle
- Tombol "Test bunyi" di Settings & Onboarding
- Jika file audio gagal diputar → popup tetap muncul tanpa bunyi + toast warning

### 2.5 Arah Kiblat
- Aktif **hanya jika perangkat punya sensor compass** (magnetometer)
- Menampilkan kompas interaktif dengan bearing ke Ka'bah
- Jika tidak ada sensor: tampilkan bearing angka statis saja (mis "292° dari utara") + info "Sensor kompas tidak tersedia"
- Perhitungan bearing dari koordinat lokasi user → Ka'bah (21.4225°N, 39.8262°E) menggunakan formula haversine/great-circle

### 2.6 Onboarding (first-run)
4 step, hanya muncul saat `onboarding_done = false`:
1. **Welcome** — penjelasan singkat fungsi widget
2. **Pilih lokasi** — toggle Auto GPS / Pilih Manual (+ search box jika manual)
3. **Atur volume** — slider + test bunyi + mute toggle
4. **Selesai** — konfirmasi "Pengingat aktif", tombol Mulai

### 2.7 Data & Caching
- Fetch jadwal harian dari API saat startup; prefetch jadwal besok
- Cache jadwal ke file lokal agar pengingat tetap jalan saat offline
- Cache list kota (`/sholat/kabkota/semua`) sekali, refresh mingguan
- Refresh jadwal saat tanggal berganti (tengah malam)

---

## 3. Arsitektur Teknis

### 3.1 Stack
- **Backend:** Rust (Tauri v2)
- **Frontend:** React + TypeScript (webview native OS — WKWebView di macOS, WebView2 di Windows)
- **Audio:** `rodio` crate
- **HTTP:** `reqwest` + `serde`
- **Async runtime:** `tokio`
- **Waktu:** `chrono` + `rs-ntp` (NTP sync)
- **Tray:** `tauri-plugin-system-tray`

### 3.2 Komponen Backend (Rust)

| Komponen | File | Tanggung jawab |
|---|---|---|
| Scheduler | `scheduler.rs` | Tokio task, cek tiap 30 detik, trigger pengingat -5 menit |
| API Client | `api.rs` | HTTP client ke myquran v3 (jadwal, search kota, IP) |
| Location Service | `location.rs` | Auto-detect via IP + manual search, resolve ke cityId + timezone |
| Time Service | `time.rs` | NTP sync UTC akurat, konversi ke timezone kota (bukan device) |
| Audio Player | `audio.rs` | Putar bedug, volume app-level, mute |
| Cache Store | `cache.rs` | Persistensi jadwal + list kota + config ke file |
| Qibla Sensor | `qibla.rs` | Baca compass (jika ada), hitung bearing ke Ka'bah |
| Config | `config.rs` | Read/write settings user |
| City Service | `city.rs` | Fetch & cache list kota, search, fuzzy match |

### 3.3 Komponen Frontend (React)

| Komponen | Tanggung jawab |
|---|---|
| `Popup.tsx` | Jadwal sholat + jam berjalan + countdown sholat berikutnya |
| `Onboarding.tsx` | 4-step wizard first run |
| `Settings.tsx` | Volume slider, mute, pilih lokasi, auto-launch toggle |
| `LocationPicker.tsx` | Toggle Auto/Manual + search box + dropdown kota |
| `QiblaCompass.tsx` | Kompas interaktif / bearing angka |

### 3.4 Struktur Proyek

```
sholat-widget/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── scheduler.rs
│   │   ├── api.rs
│   │   ├── location.rs
│   │   ├── time.rs
│   │   ├── audio.rs
│   │   ├── cache.rs
│   │   ├── qibla.rs
│   │   ├── config.rs
│   │   └── city.rs
│   ├── assets/
│   │   ├── sounds/
│   │   │   └── bedug.mp3
│   │   └── cities_fallback.json    # top 50 kota, pre-bundled
│   ├── icons/
│   │   └── mosque.png              # tray icon
│   └── tests/
│       └── fixtures/
│           ├── jadwal_response.json
│           ├── kabkota_semua.json
│           ├── kabkota_search.json
│           └── ip_response.json
├── src/                            # React frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── Popup.tsx
│   │   ├── Onboarding.tsx
│   │   ├── Settings.tsx
│   │   ├── LocationPicker.tsx
│   │   └── QiblaCompass.tsx
│   └── hooks/
│       └── useTauriCommand.ts
├── docs/superpowers/specs/
└── package.json
```

---

## 4. Data Flow

### 4.1 Startup

```
App start
   │
   ▼
Cek onboarding_done di config?
   ├─ Belum → Onboarding (4 step) → simpan config
   └─ Sudah → lanjut
   │
   ▼
Load config (cityId, timezone, volume, muted)
   │
   ▼
Time Service: NTP sync (fallback OS clock + drift)
   │
   ▼
Cek cache jadwal hari ini
   ├─ Ada & valid → pakai cache
   └─ Tidak ada/expired → fetch API jadwal hari ini + besok → cache
   │
   ▼
Scheduler mulai (tokio task, cek tiap 30 detik)
   │
   ▼
Tray icon aktif, popup siap
```

### 4.2 Auto-detect Lokasi (chain terverifikasi)

```
Step 1: GET myquran /tools/ip            → client_ip
Step 2: GET ip-api.com/json/{ip}         → { lat, lon, city, timezone }
Step 3: GET myquran /sholat/kabkota/cari/{city}  → cityId
Step 4: GET myquran /sholat/jadwal/{cityId}/today?tz={timezone}  → jadwal
```

`timezone` dari Step 2 (ip-api) dipakai untuk:
- Parameter `?tz=` di query API myquran
- Konversi NTP UTC → waktu lokal di Time Service
- Perbandingan waktu di Scheduler

Ketiganya konsisten — tidak ada hardcode mapping kota→timezone.

### 4.3 Scheduler (pseudocode)

```rust
loop {
    sleep(30 seconds);
    let now = time_service.now_local();   // waktu akurat, bukan OS mentah
    let today = now.date();
    let schedule = cache.load_schedule(today);

    for prayer in [subuh, dzuhur, ashar, maghrib, isya] {
        let reminder_time = prayer.time - 5 minutes;

        if now >= reminder_time && now < prayer.time
           && !already_reminded(prayer, today) {
            audio.play("bedug.mp3", volume, muted);
            tray.show_popup(prayer.name, prayer.time);
            mark_reminded(prayer, today);
        }
    }

    if date_changed(today, last_date) {
        api.fetch_schedule(city_id, new_date, timezone);
        reset_reminded_flags();
        last_date = new_date;
    }
}
```

Detail:
- Cek tiap 30 detik → toleransi max ~30 detik dari -5 menit
- Anti double-trigger via flag per sholat per hari di cache
- Volume/mute dibaca dari config terbaru tiap cycle (bisa berubah saat runtime)
- Saat tanggal berganti → fetch jadwal baru + reset flag

### 4.4 Popup otomatis saat pengingat

```
┌──────────────────────────┐
│            🕌             │
│                          │
│   Waktu Maghrib segera!  │
│   dalam 5 menit          │
│   pukul 18:12            │
│                          │
│   [Tutup]                │
└──────────────────────────┘
```

Bedug berbunyi bersamaan dengan popup muncul. Popup always-on-top.

---

## 5. Waktu Independen (Time Service)

### 5.1 Masalah
Device clock bisa salah (timezone salah dipilih, jam dimajukan user). Karena inti aplikasi adalah akurasi waktu sholat, scheduler tidak boleh ditipu oleh jam device.

### 5.2 Solusi
- Sumber waktu utama: **NTP** (query `pool.ntp.org` via UDP port 123)
- NTP sync saat startup + tiap 1 jam untuk koreksi drift
- Waktu lokal pakai **timezone dari ip-api** (bukan timezone device)
- Frontend popup tidak pernah hitung waktu sendiri — selalu minta ke `time_service.now_local()`

### 5.3 Fallback chain waktu

```
1. NTP sync tersedia → pakai NTP UTC → convert ke timezone kota
        │ (gagal)
        ▼
2. NTP pernah sync (dalam 24 jam) → OS clock + offset_drift tersimpan
        │ (gagal/tua)
        ▼
3. OS clock saja → flag time_unverified=true → toast ⚠ "Waktu tidak terverifikasi"
```

### 5.4 Timezone
Indonesia 3 zona: `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA), `Asia/Jayapura` (WIT).

Sumber timezone tergantung mode lokasi:
- **Auto mode:** timezone dari field `timezone` ip-api response (mis "Asia/Makassar"), dipakai langsung tanpa hardcode mapping.
- **Manual mode:** tidak ada panggilan ip-api. Timezone diturunkan dari field `prov` di response API myquran jadwal. Mapping provinsi → timezone adalah fixed mapping kecil (34 provinsi → 3 zona), disimpan di `city.rs`:

```rust
fn prov_to_timezone(prov: &str) -> &str {
    match prov {
        // WITA: Bali, Nusa Tenggara, Sulawesi, Kalimantan Tengah/Selatan/Timur/Utara
        p if WITA_PROVINCES.contains(&p) => "Asia/Makassar",
        // WIT: Maluku, Papua
        p if WIT_PROVINCES.contains(&p) => "Asia/Jayapura",
        // sisanya WIB (Sumatera, Jawa, Kalimantan Barat)
        _ => "Asia/Jakarta",
    }
}
```

Response jadwal selalu menyertakan `prov` (mis "JAWA TIMUR"), sehingga timezone manual selalu bisa diturunkan.

---

## 6. API myquran v3 (Kontrak Endpoint)

| Endpoint | Method | Fungsi | Rate limit | Status MVP |
|---|---|---|---|---|
| `/sholat/kabkota/semua` | GET | List semua kota/kabupaten | Tidak didokumentasikan | ✅ Dipakai (cache mingguan) |
| `/sholat/kabkota/cari/{query}` | GET | Search kota by nama | Tidak didokumentasikan | ✅ Dipakai |
| `/sholat/jadwal/{kotaId}/today?tz={tz}` | GET | Jadwal hari ini | Tidak didokumentasikan | ✅ Dipakai (utama) |
| `/sholat/jadwal/{kotaId}/{YYYY-MM-DD}` | GET | Jadwal tanggal spesifik | Tidak didokumentasikan | ✅ Dipakai (prefetch) |
| `/tools/ip` | GET | Deteksi IP publik | Tidak didokumentasikan | ✅ Dipakai |
| `/tools/geocode` | POST `{query}` | Geocode nama tempat → lat/lon | **1 req/detik** | ❌ Tidak dipakai MVP (post-MVP) |

### Contoh response jadwal
```json
{
  "status": true,
  "message": "success",
  "data": {
    "id": "eda80a3d5b344bc40f3bc04f65b7a357",
    "kabko": "KOTA KEDIRI",
    "prov": "JAWA TIMUR",
    "jadwal": {
      "2026-06-23": {
        "tanggal": "Selasa, 23/06/2026",
        "imsak": "04:13",
        "subuh": "04:23",
        "terbit": "05:41",
        "dhuha": "06:10",
        "dzuhur": "11:38",
        "ashar": "14:57",
        "maghrib": "17:27",
        "isya": "18:42"
      }
    }
  }
}
```

### Contoh response list kota
```json
[
  { "id": "c4ca4238a0b923820dcc509a6f75849b", "lokasi": "KAB. ACEH BARAT" },
  { "id": "c81e728d9d4c2f636f067f89cc14862c", "lokasi": "KAB. ACEH BARAT DAYA" }
]
```

### External API (di luar myquran)
- **ip-api.com** (`/json/{ip}`): IP → `{lat, lon, city, timezone}`. Gratis hingga 45 req/menit. Dipakai 1x per startup.

---

## 7. Error Handling & Edge Cases

### 7.1 Strategi
Prinsip MVP: jangan crash, degrade gracefully, log ke file untuk debugging.

| Komponen | Mode gagal | Penanganan | User experience |
|---|---|---|---|
| GPS / IP detect | Permission ditolak / tidak ada internet | Fallback ke `last_lat_long` config; jika kosong → kota default (Jakarta) + toast | App jalan, bisa override manual |
| ip-api.com | Timeout / gagal | Pakai last known location dari config | App jalan dengan lokasi terakhir |
| API fetch jadwal | Timeout / server down | Pakai jadwal cache terakhir; retry tiap cycle (30 dtk); log error | Pengingat tetap jalan (toleransi 1-2 hari) |
| API fetch list kota | Gagal saat onboarding | Pakai `cities_fallback.json` (pre-bundled top 50 kota) | Search manual tetap berfungsi |
| Audio playback | File tidak ditemukan / format salah | Catch error, log, popup tetap tampil tanpa bunyi + toast | Popup muncul, tidak bersuara |
| Compass sensor | Laptop tanpa magnetometer | Sembunyikan kompas, tampilkan bearing angka + info | Qibla tampilkan angka saja |
| Config file corrupt | JSON parse error | Backup ke `config.corrupt.json`, buat config default baru | Reset default, tidak crash |
| Cache file corrupt | JSON parse error | Hapus cache, force refetch | Slight delay, app jalan |
| Midnight date change | Offline saat fetch jadwal baru | Pakai cache hari sebelumnya; flag `stale=true`; retry | Pengingat tetap jalan (toleransi kecil) |

### 7.2 Toast / status non-intrusif
Ditampilkan di popup window:
```
(healthy)    — tidak tampilkan apa-apa / icon ✓ kecil
⚠ warning   — "Menggunakan jadwal cache (offline)" / "Lokasi tidak terdeteksi"
✗ error     — "Tidak bisa memutar audio" (tombol detail → log)
```

### 7.3 Logging
```
INFO:  startup, fetch success, reminder triggered
WARN:  fallback dipakai (cache, default city, time unverified)
ERROR: API fail, audio fail, config corrupt
```
Lokasi: `~/.config/sholat-widget/logs/app.log` (Mac) / `%APPDATA%/sholat-widget/logs/app.log` (Windows). Rotasi harian, simpan 7 hari. Tidak ada telemetri/akses jaringan untuk log.

### 7.4 Yang TIDAK ditangani di MVP
- Daylight saving / timezone rumit (Indonesia tidak pakai DST; API kembalikan waktu lokal kota)
- User pindah kota tanpa restart (deteksi ulang tiap startup, bukan real-time tracking)
- NTP time validation terhadap multiple servers (percaya satu NTP server)
- Crash recovery state (restart bersih dari state awal)

---

## 8. Config (Data Model)

```rust
struct Config {
    onboarding_done: bool,
    location_mode: LocationMode,          // Auto | ManualCity
    city_id: String,                      // kabko ID dari myquran
    city_name: String,                    // "KOTA KEDIRI"
    timezone: String,                     // "Asia/Jakarta" (dari ip-api)
    last_lat_long: Option<(f64, f64)>,    // terisi jika Auto
    volume: f32,                          // 0.0 – 1.0
    muted: bool,
    reminder_offset_minutes: i32,         // default -5 (hardcoded MVP)
    auto_launch: bool,                    // start saat boot
}

enum LocationMode {
    Auto,
    ManualCity,
}
```

Lokasi: `~/.config/sholat-widget/config.json` (Mac) / `%APPDATA%/sholat-widget/config.json` (Windows).

---

## 9. Constraints & Rate Limits

| Sumber | Batas | Dampak MVP |
|---|---|---|
| myquran `/tools/geocode` | 1 req/detik | Tidak dipakai MVP. Jika post-MVP tambah search-by-place → butuh `rate_limiter.rs` (token bucket 1/detik) |
| ip-api.com | 45 req/menit (gratis) | Dipakai 1x per startup → aman |
| myquran `/sholat/jadwal/*` | Tidak didokumentasikan | Dipakai ~1-2x/hari → aman |
| myquran `/sholat/kabkota/semua` | Tidak didokumentasikan | Cache sekali, refresh mingguan → aman |

**Untuk MVP:** tidak perlu rate limiter formal. Semua endpoint dipanggil jarang.

---

## 10. Testing Strategy

### 10.1 Layer testing

| Layer | Tools | Prioritas |
|---|---|---|
| Unit test (Rust) | `#[test]`, `mockito` | 🔴 Tinggi |
| Integration test (Rust) | `#[test]`, file temp cache | 🟡 Sedang |
| API contract test | Fixture file dari response real | 🟡 Sedang |
| Frontend test (React) | `vitest` + `@testing-library/react` | 🟢 Rendah (MVP) |
| Manual test E2E | Checklist per platform | 🔴 Tinggi |

### 10.2 Unit test kritis (wajib)

```rust
// scheduler.rs
test_should_trigger_reminder_exactly_5min_before
test_no_double_trigger_same_prayer
test_date_change_resets_flags

// api.rs
test_parse_jadwal_response           // parse JSON ke struct
test_parse_kabkota_list

// time.rs
test_utc_to_local_timezone           // UTC 03:23 + Asia/Jakarta = 10:23 WIB
test_offset_drift_correction

// location.rs
test_fuzzy_match_city_name           // "Kota Banjarmasin" == "KOTA BANJARMASIN"
```

### 10.3 API contract — fixture
Simpan response API real ke `src-tauri/tests/fixtures/`. Test parsing terhadap fixture. Jika API ubah format → test gagal → kita tahu.

### 10.4 Manual test checklist (Mac & Windows)

```
□ Tray icon mesjid muncul
□ Klik tray → popup window tampil
□ Popup menampilkan jam berjalan (update tiap detik, akurat via NTP)
□ Popup menampilkan jadwal 5 sholat + imsak
□ Onboarding 4 step berfungsi
□ Deteksi auto lokasi akurat (bandingkan manual)
□ Manual pilih kota → jadwal update
□ Search kota berfungsi (ketik "kediri" → muncul hasil)
□ Volume slider mengubah volume bedug
□ Mute toggle mematikan bunyi
□ Saat -5 menit sebelum sholat: bedug berbunyi + popup muncul
□ Popup otomatis close-able
□ Restart app → pengingat tetap jalan (config persist)
□ Disconnect internet → cache jadwal tetap dipakai
□ Qibla compass (jika sensor ada): arah akurat
□ Qibla (jika tidak ada sensor): tampilkan bearing angka
□ App start saat boot (auto-launch)
```

### 10.5 Tidak dites formal di MVP
- NTP server response (network-dependent, test manual)
- Compass sensor hardware (test di device fisik)
- Visual pixel-perfect UI (manual review)
- Performance benchmark (app ringan)

---

## 11. Out of Scope (MVP)

| Fitur | Alasan | Rencana |
|---|---|---|
| Search by place (geocode) | Rate limit 1/detik, butuh rate limiter | Post-MVP |
| Offset pengingat kustom per sholat | Kompleksitas UI | Post-MVP |
| Bunyi berbeda per sholat | Kompleksitas config | Post-MVP |
| Streaming adzan dari URL | Butuh internet, ukuran besar | Post-MVP |
| Real-time location tracking | Kompleksitas, boros baterai | Post-MVP |
| Multiple timezone support (non-Indonesia) | API fokus Indonesia | Post-MVP |
| Crash recovery state | Kompleksitas | Post-MVP |

---

## 12. Risk & Mitigasi

| Risk | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| API myquran down/bertype ubah | Sedang | Tinggi | Cache jadwal + fixture test deteksi perubahan format |
| ip-api.com rate limit terlampaui | Rendah | Sedang | Cache lokasi di config; 1 lookup per startup |
| Compass tidak ada di banyak Windows laptop | Tinggi | Rendah | Fallback bearing angka (sudah didesain) |
| NTP diblokir firewall | Rendah | Sedang | Fallback ke OS clock + drift offset |
| WebView2 belum install di Windows lama | Sedang | Tinggi | Tauri installer bundling WebView2 bootstrapper |

---

## 13. Milestone (usulan)

| Milestone | Deliverable |
|---|---|
| M1: Skeleton | Tauri project setup, tray icon mesjid, popup window kosong |
| M2: API & Lokasi | API client, location chain, city search, cache |
| M3: Scheduler & Audio | Scheduler 30-detik, trigger -5 menit, audio player bedug |
| M4: Time Service | NTP sync, timezone handling, popup jam akurat |
| M5: Onboarding & Settings | 4-step wizard, volume slider, mute, location picker |
| M6: Qibla | Compass sensor + bearing fallback |
| M7: Polish & Test | Error handling, logging, manual test Mac+Windows, build release |
