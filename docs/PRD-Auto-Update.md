# PRD: Auto-Update untuk Sholat Widget


| Field         | Value                             |
| ------------- | --------------------------------- |
| **Dokumen**   | PRD-Auto-Update                   |
| **Aplikasi**  | Sholat Widget (desktop, Tauri v2) |
| **Status**    | Draft                             |
| **Tanggal**   | 2026-07-04                        |
| **Pemilik**   | nrmadi02                          |
| **Versi PRD** | 1.0                               |


---

## 1. Latar Belakang

Sholat Widget adalah aplikasi desktop pengingat waktu sholat yang berjalan di tray sistem. Saat ini aplikasi sudah memiliki MVP (tag `v0.1.0-mvp`) dan siap untuk dirilis ke pengguna.

**Masalah:** Belum ada mekanisme distribusi versi baru. Saat developer merilis versi baru, pengguna harus:

1. Mengetahui secara manual bahwa versi baru tersedia
2. Mengunduh installer baru secara manual
3. Memasang ulang aplikasi

Ini menyebabkan fragmentasi versi di lapangan, kesulitan dalam mendistribusikan perbaikan bug/celah keamanan, dan pengalaman pengguna yang buruk.

**Solusi:** Implementasi auto-update menggunakan `tauri-plugin-updater` (Tauri v2) sehingga aplikasi dapat mendeteksi, mengunduh, dan memasang versi baru secara otomatis (atau semi-otomatis dengan persetujuan pengguna), disertai changelog yang ditampilkan dalam UI.

---



## 2. Tujuan & Non-Tujuan



### 2.1 Tujuan (In-Scope)

- **T1.** Aplikasi dapat memeriksa apakah ada versi baru dari sumber terpercaya (update manifest).
- **T2.** Aplikasi dapat mengunduh dan memverifikasi integritas update (signature) sebelum memasang.
- **T3.** Pengguna mendapat notifikasi/UI ketika update tersedia, beserta **changelog** (apa yang berubah).
- **T4.** Pengguna dapat menyetujui atau menunda update.
- **T5.** Pipeline rilis (CI/CD) yang menghasilkan artefak bertanda tangan + manifest update secara otomatis per rilis.
- **T6.** Versioning yang konsisten di seluruh stack (Tauri config, Cargo.toml, package.json, git tags).
- **T7.** Pola nama aplikasi (productName) yang proper dan profesional untuk identitas produk.



### 2.2 Non-Tujuan (Out-of-Scope)

- ❌ Auto-update untuk mobile (Android/iOS) — saat ini desktop saja.
- ❌ Update parsial / delta patching (hanya full installer).
- ❌ Rollback otomatis ke versi sebelumnya jika update gagal.
- ❌ Channel update terpisah (stable/beta/dev) di fase pertama — gunakan single channel `latest`.
- ❌ Distribusi via Mac App Store / Microsoft Store (langganan/signing store terpisah).

---



## 3. Pengguna & Persona


| Persona                             | Kebutuhan terkait update                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Pengguna akhir (Muslim desktop)** | Update tanpa repot, transparan (tahu apa yang berubah), tidak mengganggu aktivitas.                                  |
| **Developer (saya)**                | Rilis versi baru sekali commit → CI build, sign, publish otomatis. Chelog tergenerate dari konvensi commit / manual. |


---



## 4. Persyaratan Fungsional



### 4.1 Penamaan & Identitas Produk (Foundation)

Sebelum auto-update berfungsi, identitas produk harus konsisten karena `productName` memengaruhi nama installer, entry di OS, dan manifest update.


| ID     | Requirement                                                                                                      | Prioritas |
| ------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| FR-1.1 | Ubah `productName` di `tauri.conf.json` dari `sholat-widget` menjadi `Sholat Widget` (Title Case, spasi).        | Tinggi    |
| FR-1.2 | Pertahankan `identifier` `com.sholatwidget.app` (stabil, jangan diubah agar update dianggap aplikasi yang sama). | Tinggi    |
| FR-1.3 | Konsistensi `name` di `package.json` boleh tetap `sholat-widget` (npm naming) — tidak memengaruhi binary.        | Rendah    |
| FR-1.4 | Konsistensi `name` di `Cargo.toml` (`sholat-widget`) — tetap, karena menentukan crate binary.                    | Rendah    |




### 4.2 Versioning


| ID     | Requirement                                                                                                                                         | Prioritas |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-2.1 | Gunakan **Semantic Versioning** (`MAJOR.MINOR.PATCH`, mis. `0.2.0`).                                                                                | Tinggi    |
| FR-2.2 | Single source of truth untuk versi: `tauri.conf.json` **→** `version`. Cargo.toml & package.json mengikuti (bisa disamakan via script atau manual). | Tinggi    |
| FR-2.3 | Setiap rilis wajib dibuat **git tag** dengan format `v<VERSION>` (mis. `v0.2.0`), menggantikan pola lama `v0.1.0-mvp`.                              | Tinggi    |
| FR-2.4 | Versi RELEASE (bukan `-mvp`, `-beta`) wajib naik monoton. Tidak boleh ada dua rilis dengan nomor versi sama.                                        | Tinggi    |




### 4.3 Deteksi & Pemeriksaan Update


| ID     | Requirement                                                                                                                                      | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-3.1 | Aplikasi memeriksa update ke **endpoint manifest** (JSON sesuai format Tauri updater) saat startup (setelah delay ~5 detik agar tidak blocking). | Tinggi    |
| FR-3.2 | Aplikasi juga memeriksa update saat pengguna membuka **Settings → About / Update** dan menekan tombol "Periksa Update".                          | Tinggi    |
| FR-3.3 | Interval pemeriksaan otomatis minimal **sekali per 24 jam** (debounced, disimpan timestamp check terakhir di konfigurasi).                       | Sedang    |
| FR-3.4 | Pemeriksaan harus gagal dengan **graceful** (silent) jika offline — tidak menampilkan error mengganggu.                                          | Tinggi    |




### 4.4 Pengunduhan & Instalasi


| ID     | Requirement                                                                                                                                                      | Prioritas |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-4.1 | Update yang diunduh **wajib diverifikasi signature** menggunakan public key yang di-embed di aplikasi (Tauri updater default). Tolak jika signature tidak valid. | Tinggi    |
| FR-4.2 | Tampilkan **progress bar** (persentase + ukuran unduhan) selama pengunduhan.                                                                                     | Sedang    |
| FR-4.3 | Setelah unduhan selesai, **restart aplikasi** untuk memasang (Tauri updater handle ini di macOS/Windows; Linux tergantung target — lihat §9).                    | Tinggi    |
| FR-4.4 | Pengguna dapat **menunda** update ("Nanti saja") — update tidak dipaksa kecuali keamanan kritis (lihat FR-4.5).                                                  | Tinggi    |
| FR-4.5 | (Opsional, fase 2) Dukung `critical: true` di manifest untuk memaksa update jika ada celah keamanan.                                                             | Rendah    |




### 4.5 Changelog


| ID     | Requirement                                                                                                                                                      | Prioritas |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-5.1 | Setiap rilis wajib menyertakan **changelog** dalam Bahasa Indonesia di file `CHANGELOG.md` (root repo).                                                          | Tinggi    |
| FR-5.2 | Format changelog mengikuti **Keep a Changelog** (bagian: Added/Changed/Fixed/Removed) dengan referensi [Keep a Changelog](https://keepachangelog.com/id/1.1.0/). | Tinggi    |
| FR-5.3 | Saat update tersedia, UI menampilkan **ringkasan changelog versi baru** (entry terbaru) di dialog update.                                                        | Tinggi    |
| FR-5.4 | Di Settings → About, tampilkan: **versi saat ini**, **versi terbaru tersedia** (jika ada), dan **changelog penuh** (scrollable).                                 | Sedang    |
| FR-5.5 | Changelog dapat di-serve via manifest update (field `notes`/custom) ATAU di-bundle statis per rilis. Pilih satu pendekatan (lihat §7.2).                         | Tinggi    |




### 4.6 UI/UX Update


| ID     | Requirement                                                                                                              | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-6.1 | Saat update tersedia (deteksi otomatis), tampilkan **badge/notif kecil** di tray/main window (tidak modal mengganggu).   | Sedang    |
| FR-6.2 | Dialog update menampilkan: versi baru, ukuran aproximasi, changelog ringkas, tombol **"Update Sekarang"** & **"Nanti"**. | Tinggi    |
| FR-6.3 | Settings → About/Tentang: tampilkan versi saat ini + tombol "Periksa Update" + status terakhir pemeriksaan.              | Tinggi    |
| FR-6.4 | Semua teks UI terkait update dalam **Bahasa Indonesia** (konsisten dengan onboarding yg sudah di-lokalize `id`).         | Tinggi    |


---



## 5. Persyaratan Non-Fungsional


| ID    | Aspek              | Requirement                                                                                                            |
| ----- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | **Keamanan**       | Semua update wajib ditandatangani. Private key TIDAK PERNAH di-commit ke repo. Disimpan sebagai GitHub Actions secret. |
| NFR-2 | **Privasi**        | Pemeriksaan update tidak mengirim data pengguna (no telemetry). Endpoint manifest bersifat publik statis (GET saja).   |
| NFR-3 | **Performa**       | Pemeriksaan update tidak boleh menambah startup time > 200ms (async, non-blocking).                                    |
| NFR-4 | **Reliability**    | Jika endpoint update tidak bisa diakses, aplikasi tetap berjalan normal (fail-open, bukan crash).                      |
| NFR-5 | **Auditability**   | Setiap rilis tercatat di git history + GitHub Releases + CHANGELOG.md. Bisa di-trace kapan & apa yang dirilis.         |
| NFR-6 | **Kompatibilitas** | Mendukung minimal macOS (arm64 + x86_64) dan Windows (x86_64). Linux sebagai best-effort.                              |


---



## 6. Arsitektur Solusi (High-Level)

```
┌────────────────────────────────────────────────────────────┐
│                      Developer Machine                       │
│  git tag v0.2.0 && git push origin v0.2.0                   │
└────────────────────────┬───────────────────────────────────┘
                         │ triggers
                         ▼
┌────────────────────────────────────────────────────────────┐
│                  GitHub Actions Workflow                     │
│  (release.yml — on: push: tags: v*)                         │
│  1. Build frontend (bun run build)                          │
│  2. Build Tauri per-target (macOS arm64/x64, Windows x64)   │
│  3. Sign updater artifacts (TAURI_SIGNING_PRIVATE_KEY)       │
│  4. Generate latest.json (manifest) from changelog+versions │
│  5. Upload artifacts + manifest to GitHub Release            │
└────────────────────────┬───────────────────────────────────┘
                         │ publishes
                         ▼
┌────────────────────────────────────────────────────────────┐
│        GitHub Releases (static, public)                      │
│  - Sholat-Widget_0.2.0_aarch64.app.tar.gz.sig               │
│  - Sholat-Widget_0.2.0_x64-setup.exe.sig                    │
│  - latest.json (or versioned manifest)                      │
└────────────────────────┬───────────────────────────────────┘
                         │ polled by app
                         ▼
┌────────────────────────────────────────────────────────────┐
│              Sholat Widget (end user)                        │
│  ┌───────────────────────────────────────────────┐          │
│  │ tauri-plugin-updater (Rust)                   │          │
│  │  - fetch manifest → compare version            │          │
│  │  - download → verify signature → install       │          │
│  └──────────────────┬────────────────────────────┘          │
│                     │ Tauri command / event                  │
│  ┌──────────────────▼────────────────────────────┐          │
│  │ Frontend (React/TS)                            │          │
│  │  - useUpdate() hook                            │          │
│  │  - UpdateDialog component                      │          │
│  │  - Settings → About section                    │          │
│  └───────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────┘
```

---



## 7. Detail Teknis & Keputusan Desain



### 7.1 Plugin & Endpoint

- **Plugin:** `tauri-plugin-updater` v2 (official, menggantikan updater built-in Tauri v1).
- **Endpoint manifest:** Gunakan GitHub Releases via raw URL atau proxy CDN. Format JSON sesuai [Tauri updater v2 schema](https://v2.tauri.app/plugin/updater/).
- **Endpoint contoh:** `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` (atau `/<version>.json` jika ingin per-version).



### 7.2 Strategi Changelog (PILIH SALAH SATU)

**Opsi A — Bundle via manifest (REKOMENDASI):**

- Saat CI generate manifest, inject field `notes` berisi changelog versi tersebut (parse dari CHANGELOG.md bagian `[x.y.z]`).
- Frontend baca langsung dari response update check.
- ✅ Pros: real-time, tidak perlu hardcode, selalu sinkron dengan rilis.
- ❌ Cons: butuh parsing CHANGELOG di CI.

**Opsi B — Bundle statis di app:**

- `CHANGELOG.md` di-bundle sebagai resource Tauri, frontend parse saat runtime.
- ✅ Pros: sederhana.
- ❌ Cons: changelog "versi baru" tidak tersedia di app lama (pengguna harus update dulu untuk melihat).

→ **Rekomendasi: Opsi A** karena changelog versi baru harus terlihat *sebelum* update dipasang.

### 7.3 Signing Keys

- Generate keypair: `bunx @tauri-apps/cli signer generate -w ~/.tauri/sholat-widget.key`.
- **Private key** → GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (+ password `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- **Public key** → embed di `tauri.conf.json` field `plugins.updater.pubkey`.
- ⚠️ Jangan commit private key. Tambahkan `*.key` ke `.gitignore` (sudah aman karena saat ini tidak ada key).



### 7.4 Cross-Platform Notes


| Platform    | Installer format       | Updater support                                                                          |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| **macOS**   | `.app.tar.gz` (+ sig)  | ✅ Tauri handle: replace app bundle, restart.                                             |
| **Windows** | `.exe` (NSIS) + `.sig` | ✅ Tauri handle: download, run installer silent, restart.                                 |
| **Linux**   | `.AppImage` / `.deb`   | ⚠️ AppImage didukung updater; `.deb` butuh user reinstall manual. Fase 1: AppImage saja. |


---



## 8. Ketergantungan Pra-Implementasi (Blockers)

Sebelum implementasi bisa dimulai, hal-hal berikut **wajib** diselesaikan:

1. **[B-1] Setup git remote.** Saat ini belum ada remote (`git remote -v` kosong). CI/CD butuh repo GitHub.
  - Action: Buat repo GitHub `sholat-widget` (atau nama lain), `git remote add origin <url>`.
2. **[B-2] Install GitHub CLI (**`gh`**).** Saat ini `gh` tidak ditemukan di sistem. Dipakai untuk release management & secret injection manual jika perlu.
  - Action: `brew install gh && gh auth login`.
3. **[B-3] Generate signing keypair.** Lihat §7.3.
4. **[B-4] Buat GitHub repo public** (karena endpoint update perlu publik untuk Tauri updater free tier; atau gunakan private + token — lebih kompleks, tidak direkomendasikan fase 1).

---



## 9. Risiko & Mitigasi


| Risiko                                                                | Dampak     | Mitigasi                                                                                                                                      |
| --------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Private key bocor → attacker rilis malware sebagai "update".          | **Kritis** | Simpan ONLY sebagai GH secret. Rotasi key jika terindikasi leak. Verifikasi signature wajib.                                                  |
| macOS Gatekeeper menolak app karena unsigned developer cert.          | Tinggi     | Fase 1: distribusi di luar App Store, document workaround `xattr -d` (sudah umum untuk app Tauri indie). Fase 2: Apple Developer ID ($99/yr). |
| Endpoint GitHub Releases rate-limited (jarang untuk download publik). | Sedang     | Bisa pindah ke CDN/Vercel/Cloudflare Pages untuk manifest jika perlu.                                                                         |
| Update gagal di tengah jalan (network drop).                          | Sedang     | Tauri updater sudah handle retry & tidak replace app sampai download+verify sukses.                                                           |
| Versi tidak naik (lupa bump) → manifest tidak dianggap baru.          | Sedang     | CI guard: bandingkan version di tag vs tauri.conf.json, fail jika mismatch.                                                                   |
| Linux `.deb` user tidak dapat auto-update.                            | Rendah     | Dokumentasi: rekomendasikan AppImage untuk pengguna Linux.                                                                                    |


---



## 10. Metrik Sukses


| Metrik                                    | Target                                |
| ----------------------------------------- | ------------------------------------- |
| Adoption rate update dalam 7 hari rilis   | ≥ 60% pengguna aktif di versi terbaru |
| Tingkat kegagalan update                  | < 2% dari percobaan update            |
| Waktu dari `git tag` ke rilis publik (CI) | < 20 menit                            |
| Bug report terkait update                 | 0 critical bug pada mekanisme update  |


> Catatan: Metrik butuh telemetry ringan untuk diukur. Karena NFR-2 melarang telemetry, fase 1 metrik diukur **manual** via GitHub Releases download count + issue report. Fase 2 dapat dipertimbangkan opt-in analytics.

---

