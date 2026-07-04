# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan proyek ini mematuhi [Semantic Versioning](https://semver.org/lang/id/).

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

- MVP Sholat Widget: widget tray, jadwal sholat Kemenag, pengingat + bedug
- Onboarding lokasi (otomatis / manual kota)
- Sinkronisasi waktu NTP
- Pengaturan volume, mute, dan autostart