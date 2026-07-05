# Sholat Widget

Aplikasi desktop pengingat waktu sholat untuk Muslim di Indonesia. Berjalan di **system tray**, menampilkan jadwal harian dari Kemenag (via [MyQuran API](https://api.myquran.com/v3)), dan memberi pengingat **1 menit** sebelum setiap waktu sholat — popup, notifikasi OS, dan suara azan.

Dibangun dengan **Tauri v2** (Rust) + **React 19** (TypeScript). Ringan, native, dan mendukung auto-update.

**Versi saat ini:** `0.4.0`

## Fitur

- **Widget tray** — jadwal sholat hari ini, countdown ke sholat berikutnya, status pengingat (aktif/nonaktif)
- **Pengingat sholat** — popup 1 menit sebelum waktu masuk, azan otomatis, notifikasi tray terpadu dengan aksi Stop
- **Jadwal Kemenag** — data dari MyQuran API, di-cache untuk hari berjalan (tetap jalan offline)
- **Lokasi** — deteksi otomatis (IP/geolokasi) atau pilih kota manual
- **Waktu akurat** — sinkronisasi NTP, bukan hanya jam sistem
- **Pengaturan** — volume/mute azan, toggle pengingat, lokasi, autostart
- **Onboarding** — wizard singkat saat pertama kali (atau setelah perubahan flow signifikan)
- **Auto-update** — deteksi versi baru, unduh, pasang, tampilkan changelog (macOS & Windows)

## Platform

| Platform | Status |
| -------- | ------ |
| macOS (Apple Silicon & Intel) | Didukung |
| Windows | Didukung |
| Linux | Build CI tersedia |

## Unduh

Rilis terbaru: [GitHub Releases](https://github.com/nrmadi02/sholat-widget/releases/latest)

Aplikasi yang sudah terpasang akan menerima notifikasi pembaruan otomatis.

## Pengembangan

### Prasyarat

- [Bun](https://bun.sh) (package manager)
- [Rust](https://rustup.rs) (stable, ≥ 1.77)
- Dependensi Tauri untuk platform Anda — lihat [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
git clone https://github.com/nrmadi02/sholat-widget.git
cd sholat-widget
bun install
bun run tauri dev
```

### Perintah umum

| Perintah | Keterangan |
| -------- | ---------- |
| `bun run dev` | Frontend Vite saja |
| `bun run tauri dev` | Aplikasi lengkap (dev) |
| `bun run tauri build` | Build produksi |
| `bun run lint` | Lint frontend (oxlint) |
| `cargo test` (di `src-tauri/`) | Unit test backend |

### Struktur proyek

```
sholat-widget/
├── src/                    # React frontend
│   ├── components/         # UI (Onboarding, Settings, tray/main/reminder windows)
│   └── hooks/              # useConfig, useSchedule, useUpdate, …
├── src-tauri/              # Rust backend
│   └── src/
│       ├── api.rs          # MyQuran & geolocation
│       ├── scheduler.rs    # Pengingat background
│       ├── config.rs       # Persistensi pengaturan
│       └── updater.rs      # Auto-update
├── docs/                   # PRD & desain
└── CHANGELOG.md            # Riwayat rilis
```

## Konfigurasi pengguna

Pengaturan disimpan di luar folder aplikasi (tetap ada setelah update):

| Platform | Lokasi |
| -------- | ------ |
| macOS | `~/Library/Application Support/sholat-widget/config.json` |
| Windows | `%APPDATA%\sholat-widget\config.json` |

## Onboarding ulang (untuk kontributor)

Saat flow onboarding berubah signifikan, naikkan konstanta di `src-tauri/src/config.rs`:

```rust
pub const CURRENT_ONBOARDING_SCHEMA_VERSION: u32 = 1; // bump saat flow berubah
```

Pengguna dengan `onboarding_schema_version` lebih rendah akan diminta menjalankan onboarding lagi setelah update. Patch release biasanya tidak perlu menaikkan angka ini.

## Rilis

Rilis mengikuti [Semantic Versioning](https://semver.org/lang/id/). Push tag `v*` memicu GitHub Actions untuk build, sign, dan publish ke GitHub Releases + manifest `latest.json`.

```bash
# Pastikan versi selaras di tauri.conf.json, package.json, Cargo.toml
git tag -a v0.4.0 -m "v0.4.0"
git push origin master --tags
```

Detail pipeline: `.github/workflows/release.yml`

## Dokumentasi

- [CHANGELOG.md](./CHANGELOG.md) — perubahan per versi
- [docs/PRD.md](./docs/PRD.md) — requirement produk
- [docs/PRD-Auto-Update.md](./docs/PRD-Auto-Update.md) — spesifikasi auto-update

## Lisensi

Proyek privat (`"private": true` di `package.json`). Hak cipta pemilik repositori.