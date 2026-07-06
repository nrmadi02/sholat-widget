# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan proyek ini mematuhi [Semantic Versioning](https://semver.org/lang/id/).

## [0.4.1] - 2026-07-06

### Diperbaiki

- Popup pengingat tidak lagi ditutup otomatis saat waktu sholat tiba — sesi pengingat dan notifikasi tray tetap sampai pengguna menutup atau sholat berikutnya

### Diubah

- Teks popup saat countdown mencapai 0: **sudah tiba.** (bukan "segera tiba.")

## [0.4.0] - 2026-07-05

### Diubah

- Onboarding diulang otomatis untuk pengguna lama saat `onboarding_schema_version` di config lebih rendah dari versi schema saat ini (schema v1: izin notifikasi + flow pengingat baru)

- Pengingat dipindah ke **1 menit** sebelum waktu sholat (dari 5 menit)
- Flow pengingat UX: azan otomatis saat popup muncul, popup terkunci hanya saat azan berbunyi
- Tombol **Dengar azan** diganti **Putar ulang** (setelah stop atau jika suara dibisukan)
- Satu notifikasi tray terpadu (countdown → progress azan + aksi Stop)
- Pengingat tidak berjalan otomatis tanpa izin OS + toggle **Aktifkan pengingat**
- Onboarding: izin notifikasi diprioritaskan di langkah pertama
- Pengaturan disederhanakan: Pengingat Sholat, Suara Azan, Lokasi

### Ditambahkan

- Status pengingat di tray widget (hijau aktif / kuning nonaktif, ketuk untuk aktifkan)
- Tombol pengaturan di header tray popup
- Event `azan-stopped` untuk sinkronisasi stop audio lintas UI
- Field config `notifications_enabled`
- Command `open_notification_settings`, `close_reminder_window`, `set_azan_playback_locked_cmd`

## [0.3.2] - 2026-07-05

### Diubah

- Suara pengingat diganti dari bedug ke **azan** (`azan.mp3`) di seluruh aplikasi dan dokumentasi

### Ditambahkan

- Preview azan di onboarding dengan progress bar dan tombol **Stop**
- Command `get_azan_duration_ms` dan `stop_test_sound` untuk kontrol preview audio

## [0.3.1] - 2026-07-04

### Diperbaiki

- Popup tray muncul di posisi salah — deteksi tepi taskbar (atas/bawah/kiri/kanan) dan posisikan popup relatif terhadap ikon tray

## [0.3.0] - 2026-07-04

### Diperbaiki

- Aplikasi tidak bisa quit dari menu tray — `ExitGuard` mengizinkan keluar eksplisit
- Main window tidak update setelah onboarding selesai di tray — emit `config-updated` lintas window
- Test bunyi tidak bersuara — audio diputar di thread terpisah dengan volume/mute dari slider onboarding
- Build Linux CI gagal — tambah dependensi `libasound2-dev`

## [0.2.0] - 2026-07-04

### Ditambahkan

- Auto-update dengan `tauri-plugin-updater` — deteksi, unduh, dan pasang versi baru
- Dialog pembaruan dengan changelog dan progress bar unduhan
- Bagian Tentang di Pengaturan: versi saat ini, periksa update, riwayat pemeriksaan
- Badge notifikasi update di tray dan jendela utama
- Pipeline CI/CD GitHub Actions untuk rilis otomatis bertanda tangan

### Diubah

- Nama produk menjadi "Sholat Widget" (Title Case) untuk installer dan identitas OS
- Versi rilis mengikuti Semantic Versioning (`v0.2.0`)

## [0.1.0] - 2026-07-03

### Ditambahkan

- MVP Sholat Widget: widget tray, jadwal sholat Kemenag, pengingat + azan
- Onboarding lokasi (otomatis / manual kota)
- Sinkronisasi waktu NTP
- Pengaturan volume, mute, dan autostart