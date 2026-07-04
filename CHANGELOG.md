# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan proyek ini mematuhi [Semantic Versioning](https://semver.org/lang/id/).

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