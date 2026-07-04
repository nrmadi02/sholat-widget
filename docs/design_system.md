# Design System — Sholat Widget

> Source of truth untuk UI/UX aplikasi. Berfungsi sebagai kontrak visual antara mockup
> (`docs/sholat-widget-mvp-mockup.html`), komponen shadcn/ui, dan implementasi React+Tauri.
>
> **Acaruan visual:** `docs/sholat-widget-mvp-mockup.html`
> **Stack UI:** React 19 + Tailwind CSS v4 + shadcn/ui (hybrid glassmorphism)
> **Runtime:** Tauri 2 (Rust backend, webview OS native)

---

## 1. Kepatuhan Skill & Aturan Mutlak

Dokumen ini mengikuti skill **`shadcn`**. Aturan berikut **wajib** dipatuhi saat mengimplementasi:

- **Token semantik, bukan warna mentah.** Pakai `bg-background`, `text-muted-foreground`, dll. Tidak ada `bg-blue-500`/`text-orange-600` inline.
- **`className` untuk layout, bukan style.** Jangan override warna/typografi komponen shadcn lewat `className`.
- **`gap-*`, bukan `space-x/y-*`.** Spasi vertikal: `flex flex-col gap-*`.
- **`size-*`** bila width = height (`size-10`, bukan `w-10 h-10`).
- **`cn()`** untuk class kondisional, bukan template literal ternary.
- **Komposisi penuh.** `Card` → `CardHeader/Title/Content/Footer`. `Dialog/Sheet/Drawer` wajib punya `*Title`.
- **Icons via `lucide-react`** (default shadcn), dioper sebagai objek, bukan string.
- **Form via `FieldGroup` + `Field`**. Validasi: `data-invalid` di `Field`, `aria-invalid` di kontrol.
- **Toast via `sonner`** (`toast()`), bukan markup kustom.

Aturan lain yang spesifik aplikasi ini:

- **PR-080 — Tidak ada inline styles.** Migrasi penuh dari `style={{}}` (kode saat ini) ke Tailwind/shadcn. Inline style hanya untuk nilai dinamis yang tidak bisa dinyatakan sebagai class (mis. rotasi needle kompas `rotate(${bearing}deg)`).
- **PR-090 — Window OS-native, UI platform-agnostic.** Posisi/jendela diatur Rust; React hanya merender isi.
- **PR-100 — Waktu dari Rust.** Selalu pakai `useLiveClock()` (NTP-synced), jangan `new Date()`.

---

## 2. Arsitektur Multi-Window

Keputusan: **multi-window**. Ada dua surface berbeda yang dipisahkan secara OS-native.

```
┌─────────────────────────────────────────────────────────────┐
│  System Tray (ikon masjid)                                   │
│   ├─ Left click  → toggle window "tray" (flyout 320×480)     │
│   └─ Right click → context menu (Settings / Quit)            │
└─────────────────────────────────────────────────────────────┘
        │                            │
        ▼                            ▼
┌──────────────────┐     ┌─────────────────────────────────┐
│ Window "tray"    │     │ Window "main"                    │
│ 320×480          │     │ 920×640 (resizable)              │
│ borderless,      │     │ decorated (titlebar) atau        │
│ transparent,     │     │ custom titlebar via `data-tauri- │
│ always-near-tray │     │ drag-region`                     │
│                  │     │                                  │
│ • Live clock     │     │ • Big live clock                 │
│ • Next prayer    │     │ • Full schedule list             │
│ • Quick actions  │     │ • Action bar (refresh/settings/  │
│   → Buka Aplikasi├────►│   qibla/mute)                    │
│                  │     │ • Data source footer             │
└──────────────────┘     └─────────────────────────────────┘
        │
        │ (perlu onboarding)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Window "tray" merender <Onboarding/> saat !onboarding_done   │
│ (onboarding adalah flow in-window, bukan window terpisah)    │
└─────────────────────────────────────────────────────────────┘

Overlay (di dalam window "tray" atau "main", via shadcn Dialog/Sheet):
  • Settings       (Dialog)
  • Qibla compass  (Dialog)
  • Reminder popup (Dialog, non-dismissable saat aktif)
  • Location picker(Command palette dalam Settings)
```

### 2.1 Konfigurasi Tauri (`tauri.conf.json`)

Dua entri di `app.windows[]`. Properti kunci per window:

| Properti          | `tray`                         | `main`                          |
| ----------------- | ------------------------------ | ------------------------------- |
| `label`           | `"tray"`                       | `"main"`                        |
| `width` / `height`| 320 / 480                      | 920 / 640                       |
| `resizable`       | `false`                        | `true`                          |
| `decorations`     | `false` (borderless)           | `true` macOS/Windows (ataun custom drag-region) |
| `transparent`     | `true`                         | `false` (opaque) atau `true` bila glass |
| `visible`         | `false` (show on tray click)   | `false` (show via "Buka Aplikasi") |
| `alwaysOnTop`     | `true`                         | `false`                         |
| `skipTaskbar`     | `true` (Windows)               | `false`                         |
| `shadow`          | `false` (shadow via CSS)       | `true`                          |

**Window routing React:** satu `App` membaca label window aktif via `@tauri-apps/api/webviewWindow`
dan merender `<TrayWindow/>` atau `<MainWindow/>`. Command `get_config` tetap dipakai
untuk guard onboarding di window `tray`.

```tsx
// src/App.tsx (skema)
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
const label = getCurrentWebviewWindow().label;
// label === "tray" → <TrayWindow/>
// label === "main" → <MainWindow/>
```

### 2.2 Posisi tray flyout

Posisi window `tray` relatif terhadap ikon tray dihitung di Rust pada `TrayIconEvent::Click`:

```text
macOS:  anchor = pojok kanan atas layar (menu bar), flyout muncul di bawah ikon.
Windows: anchor = pojok kanan bawah (di atas taskbar), flyout muncul di atas ikon.
```

Implementasi: `tray.position()` + `app.monitor_from_point(...)` → hitung `win.set_position(...)`
sebelum `win.show()`. Detail API di skill `rust-patterns` / Tauri tray docs.

---

## 3. Design Tokens

Sumber: CSS variables di mockup (`:root`). Dipetakan ke **semantic tokens** shadcn (format Tailwind v4 `@theme inline`). Disimpan di `src/index.css` (file global yang sudah ada — **jangan buat file baru**).

### 3.1 Pemetaan mockup → token

| Mockup (`:root`)     | Nilai (oklch)           | Token shadcn            |
| -------------------- | ----------------------- | ----------------------- |
| `--bg`               | `oklch(97% 0.005 250)`  | `--background`          |
| `--surface`          | `oklch(100% 0 0)`       | `--card`                |
| `--fg`               | `oklch(18% 0.012 250)`  | `--foreground`          |
| `--muted`            | `oklch(52% 0.012 250)`  | `--muted-foreground`    |
| `--border`           | `oklch(90% 0.005 250)`  | `--border`              |
| `--accent` (jingga)  | `oklch(62% 0.17 35)`    | `--primary`             |
| —                    | turunan                 | `--primary-foreground`  |
| —                    | turunan                 | `--secondary` / `--muted` |
| —                    | turunan                 | `--accent` (shadcn) / `--destructive` |

> **Catatan penamaan:** mockup menyebut `--accent` untuk warna jingga brand.
> shadcn sudah memakai nama `--accent` untuk highlight semi-transparent, jadi warna brand jingga
> dipetakan ke **`--primary`** shadcn. Ini agar `variant="primary"` (default) Button langsung pakai brand color.

### 3.2 Block `@theme inline` (Tailwind v4)

Ditambahkan ke `src/index.css`:

```css
@import "tailwindcss";

@theme inline {
  /* Brand — dari mockup */
  --color-primary: oklch(62% 0.17 35);
  --color-primary-foreground: oklch(98% 0.005 35);

  /* Neutral surfaces — dari mockup */
  --color-background: oklch(97% 0.005 250);
  --color-foreground: oklch(18% 0.012 250);
  --color-card: oklch(100% 0 0);
  --color-card-foreground: oklch(18% 0.012 250);
  --color-muted: oklch(95% 0.005 250);
  --color-muted-foreground: oklch(52% 0.012 250);
  --color-border: oklch(90% 0.005 250);
  --color-input: oklch(90% 0.005 250);
  --color-ring: oklch(62% 0.17 35);

  /* Status — disesuaikan dari mockup pills/toasts */
  --color-accent: oklch(95% 0.03 35);          /* hover surface */
  --color-accent-foreground: oklch(40% 0.12 35);
  --color-destructive: oklch(58% 0.2 25);
  --color-destructive-foreground: oklch(98% 0 0);

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-display: "Space Grotesk", "Inter", sans-serif;

  /* Radius — mockup pakai 10–16px */
  --radius: 0.625rem;          /* 10px (Button/Input) */
  --radius-lg: 0.875rem;       /* 14px (Card) */
  --radius-xl: 1.5rem;         /* 24px (window/glass container) */

  /* Motion */
  --ease-snap: cubic-bezier(0.23, 1, 0.32, 1);
}
```

### 3.3 Dark mode

Mockup punya `.glass-dark` (`rgba(15,23,42,0.75)`). Definisikan via `.dark` selector:

```css
.dark {
  --color-background: oklch(15% 0.012 250);
  --color-foreground: oklch(96% 0.005 250);
  --color-card: oklch(20% 0.012 250);
  --color-card-foreground: oklch(96% 0.005 250);
  --color-muted: oklch(25% 0.012 250);
  --color-muted-foreground: oklch(70% 0.012 250);
  --color-border: oklch(28% 0.012 250);
  --color-primary: oklch(68% 0.16 35);         /* sedikit lebih terang */
  --color-primary-foreground: oklch(15% 0.012 250);
}
```

Preferensi: ikut sistem OS (`prefers-color-scheme`), toggle manual opsional di Settings (fase lanjut).

---

## 4. Variant Kustom: Glass (Hybrid)

Inti dari arah visual "hybrid shadcn + glass". Didefinisikan sebagai **utility class** di `src/index.css`
(bukan override komponen shadcn), sehingga tidak melanggar aturan "jangan override warna komponen".

```css
@layer utilities {
  .glass {
    background: color-mix(in oklch, var(--color-card) 65%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid color-mix(in oklch, white 35%, transparent);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.08);
  }
  .glass-strong {
    background: color-mix(in oklch, var(--color-card) 80%, transparent);
    backdrop-filter: blur(28px) saturate(200%);
    -webkit-backdrop-filter: blur(28px) saturate(200%);
  }
}
```

**Aturan pemakaian glass:**

- Hanya untuk **kontainer window-level**: body window `tray`, dialog overlay, main window shell.
- **Tidak** untuk komponen shadcn biasa (Button, Input, Badge tetap opaque sesuai variant default).
- Card di *dalam* window glass: tetap pakai `Card` shadcn (opaque `bg-card`), supaya kontras terjaga.

Contoh pemakaian pada root window:

```tsx
<div className="glass rounded-xl">  {/* shell window */}
  <Card>…</Card>                    {/* Card opaque di dalamnya */}
</div>
```

---

## 5. Typography

| Peran                     | Font            | Class                                       |
| ------------------------- | --------------- | ------------------------------------------- |
| Body / UI                 | Inter           | default (`font-sans`)                       |
| Display (judul, jam besar)| Space Grotesk   | `font-display tracking-tight`               |
| Numeric (jam, countdown)  | JetBrains Mono  | `font-mono tabular-nums`                    |

Muat font via `<link>` di `index.html` (mockup sudah pakai Google Fonts CDN). Untuk offline,
bundle font di `public/fonts/` dan `@font-face` di `index.css` (fase distribusi).

Skala ukuran kunci (dari mockup):

| Elemen                | Ukuran            |
| --------------------- | ----------------- |
| Jam popup             | `text-6xl` (60px) |
| Jam main app          | `text-7xl` (72px) |
| Countdown             | `text-4xl` (36px) |
| Nama sholat           | `text-2xl` (24px) |
| Section header        | `text-xs uppercase tracking-wider text-muted-foreground` |
| Body                  | `text-sm` (14px)  |
| Meta/footer           | `text-xs` (12px)  |

---

## 6. Invetaris Komponen

Pemetaan setiap elemen mockup → komponen shadcn. **Gunakan komponen yang sudah ada dulu**
(cek `npx shadcn@latest info` / folder `src/components/ui` sebelum `add`).

| Elemen di mockup                | Komponen shadcn                         | Catatan |
| -------------------------------- | --------------------------------------- | ------- |
| Tombol "Buka Aplikasi"/Settings  | `Button` (`default` / `ghost` / `sm`)   | ikon via `data-icon="inline-start"` |
| Card info (lokasi/qibla di settings) | `Card` + sub-parts                 | komposisi penuh |
| Input cari kota                  | `Input` (dalam `Field`)                 | atau `InputGroup` bila ada tombol |
| Hasil pencarian kota             | `Command` (dalam `Dialog`) atau list `Button variant=ghost` | lihat §6.4 |
| Radio lokasi (Auto/Manual)       | `RadioGroup` + `RadioGroupItem`         | dibungkus `FieldSet`+`FieldLegend` |
| Slider volume                    | `Slider`                                | bind ke state, tampilkan nilai |
| Toggle mute / auto-launch        | `Switch`                                | bukan checkbox native |
| Daftar waktu sholat              | list custom + `cn()` untuk state aktif  | lihat §6.1 |
| Header section "JADWAL HARI INI" | `<p className="text-xs uppercase…">`    | tidak perlu komponen |
| Modal Settings/Qibla/Reminder    | `Dialog` (+ `DialogTitle`, wajib)       | title `sr-only` bila visual hidden |
| Toast feedback                   | `sonner` (`toast.success()` dst.)       | **jangan** buat div toast sendiri |
| Step indicator onboarding        | indikator kustom + `cn()`               | lihat §6.2 |
| Kompas kiblat                    | kustom (transform dinamis)              | lihat §6.3 |
| Tray icon                        | asset `icons/` (Rust-side)              | bukan komponen React |
| Status badge "Widget aktif"      | `Badge variant=secondary`               | + dot pulse |
| Feature pills (di bawah mockup)  | `Badge variant=outline`                 | — |

### 6.1 PrayerRow (kustom, tipis)

Tidak ada komponen shadcn "list row". Buat komponen kecil di `src/components/`:

```tsx
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PrayerRowProps {
  icon: LucideIcon;
  label: string;
  time: string;
  active?: boolean;
}

export function PrayerRow({ icon: Icon, label, time, active }: PrayerRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg px-4 py-3 transition-colors",
        "hover:bg-accent/50",
        active && "bg-primary/8 border-l-[3px] border-primary"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className="text-primary" />
        <span className={cn("font-medium", active && "text-primary")}>{label}</span>
      </div>
      <span className={cn("font-mono text-lg tabular-nums", active ? "text-primary" : "text-muted-foreground")}>
        {time}
      </span>
    </div>
  );
}
```

Mapping ikon sholat (dari `lucide-react`) — mockup pakai `cloud/sun/moon`:

| Sholat   | Ikon lucide  |
| -------- | ------------ |
| Imsak    | `Cloud`      |
| Subuh    | `Sunrise`    |
| Terbit   | `Sun`        |
| Dhuha    | `SunMedium`  |
| Dzuhur   | `Sun`        |
| Ashar    | `CloudSun`   |
| Maghrib  | `Sunset`     |
| Isya     | `Moon`       |

### 6.2 Onboarding step indicator

Mockup memakai `.step-dot`. Implementasi: daftar kecil dengan `cn()`, bukan komponen baru.
Lihat pola di skill `shadcn` rules/composition — atau gunakan `Stepper` dari registry komunitas
bila ingin (verifikasi via `npx shadcn@latest search` dulu; **jangan tebak registry**).

### 6.3 Kibla compass

Hanya bagian yang **benar-benar dinamis** (rotasi needle) boleh pakai inline style:

```tsx
<div className="compass-needle" style={{ transform: `translate(-50%, -100%) rotate(${bearing}deg)` }} />
```

Container kompas, cardinal marks, dll. → Tailwind classes. Bearing datang dari command
`get_qibla_bearing(lat, lon)` yang sudah ada di Rust.

### 6.4 Location picker (Command palette)

Pencarian kota di mockup adalah input + dropdown hasil. Implementasi terbaik: `Command` shadcn
(dibungkus `Dialog` atau `Popover`). Bind ke command `search_cities(query)` yang sudah ada.
Lebih native daripada `<input>` + `<div>` manual (kode saat ini di `Onboarding.tsx`).

---

## 7. Iconography

- **Library:** `lucide-react` (default shadcn). Mockup memakai Font Awesome — **ganti semua** ke lucide.
- **Pemetaan ikon mockup → lucide:**

| Mockup (Font Awesome)   | lucide-react     |
| ----------------------- | ---------------- |
| `fa-mosque`             | ikon brand kustom (SVG `mosque.png` sudah ada) atau `Church`/fallback |
| `fa-cog`                | `Settings`       |
| `fa-compass`            | `Compass`        |
| `fa-sync-alt`           | `RotateCw` / `RefreshCw` |
| `fa-volume-up`          | `Volume2`        |
| `fa-volume-mute`        | `VolumeX`        |
| `fa-times`              | `X`              |
| `fa-window-maximize`    | `Maximize2` / `AppWindow` |
| `fa-check-circle`       | `CheckCircle2`   |
| `fa-cloud-sun`          | `CloudSun`       |
| `fa-globe`              | `Globe`          |
| `fa-wifi`               | `Wifi`           |

- **Aturan ikon dalam Button:** `data-icon="inline-start"` / `"inline-end"`, **tidak ada** class sizing (`size-4` dll.).
- Ikon brand masjid: pakai asset `src-tauri/icons/mosque.png` atau inline SVG kustom di `src/components/icons/Mosque.tsx`.

---

## 8. Motion / Animation

Dari keyframes mockup. Definisikan sebagai utility, bukan keyframe global tersebar:

| Animasi mockup         | Pemakaian                  | Implementasi                     |
| ---------------------- | -------------------------- | -------------------------------- |
| `popup-enter` (0.2s)   | window tray muncul         | CSS di `index.css` + class `.animate-popup-enter` |
| `app-window-enter`     | window main muncul         | `.animate-app-enter`             |
| `toast-slide`          | toast                      | bawaan `sonner` (jangan buat sendiri) |
| compass needle rotate  | transisi bearing           | `transition-transform duration-700 ease-[var(--ease-snap)]` |
| tray icon hover/active | micro feedback             | `transition-transform active:scale-95 hover:scale-110` |

Semua pakai easing `--ease-snap: cubic-bezier(0.23, 1, 0.32, 1)` (dari mockup).
Hindari animasi yang memperlambat aksi inti (clock tick, countdown) — tetap instan.

---

## 9. State & Interaction Patterns

### 9.1 State aktif sholat berikutnya

- Row sholat berikutnya: `bg-primary/8 border-l-[3px] border-primary`, teks `text-primary`.
- Tentukan via `findNextPrayer()` (sudah ada di `Popup.tsx`) — pertahankan logika, ganti hanya rendering.

### 9.2 Countdown

- Format `MM:SS` atau `HH:MM`, font `font-mono tabular-nums`.
- Source: hitung di React dari `clock` (NTP via `useLiveClock`) dikurangi waktu sholat.
- Update tiap detik (clock hook sudah tiap detik).

### 9.3 Reminder popup (5 menit sebelum)

- Trigger: event Tauri `prayer-reminder` (sudah ada di `App.tsx` + `scheduler.rs`).
- Render: `Dialog` non-dismissable (`onInteractOutside={(e)=>e.preventDefault()}`), auto-close setelah 60s (sudah ada).
- Aksi: "Dengar Bedug" → command `test_sound` (sudah ada).

### 9.4 Empty / error / loading

| Kondisi                | Komponen shadcn            |
| ---------------------- | -------------------------- |
| Schedule belum loaded  | `Skeleton` (row placeholder) |
| Schedule gagal fetch   | `Empty` + retry `Button`   |
| Lokasi belum resolved  | `Badge variant=secondary` "Mendeteksi lokasi…" + `Spinner` |
| Offline (cache stale)  | `Alert` ("Menampilkan data cache") |

---

## 10. Setup shadcn/ui (Fase Inisiasi)

Proyek **belum punya** `components.json` dan **belum pakai Tailwind**. Langkah setup:

```bash
# 1. Install Tailwind v4 + tooling shadcn
bun add tailwindcss @tailwindcss/vite
# 2. Add plugin ke vite.config.ts (plugins: [react(), tailwindcss()])
# 3. Init shadcn (akan buat components.json, lib/utils.ts, inject theme)
bunx shadcn@latest init --preset nova --template vite
#    ^ gunakan runner bun (packageManager = bun dari package.json)
# 4. Tambah alias @/ → src/ di tsconfig + vite resolve.alias
# 5. Inject design tokens (§3.2) & variant glass (§4) ke src/index.css
```

**Verifikasi konteks proyek** sebelum install komponen apa pun:

```bash
bunx shadcn@latest info --json   # cek aliases, base, iconLibrary, tailwindVersion
```

**Install komponen awal** (batch, dari tabel §6):

```bash
bunx shadcn@latest add button card dialog input slider switch radio-group \
  badge alert skeleton sonner command popover separator
```

Setelah `add`, selalu **baca file yang ditambahkan** dan verifikasi (skill `shadcn` langkah 7):
sub-komponen lengkap, import sesuai alias proyek, ikon sesuai `iconLibrary`.

---

## 11. Struktur Folder Frontend (Target)

```
src/
├── App.tsx                  # router window (tray vs main by label)
├── main.tsx
├── index.css                # @theme inline + tokens + .glass utilities
├── lib/
│   └── utils.ts             # cn() — dibuat shadcn init
├── components/
│   ├── ui/                  # komponen shadcn (jangan edit sembarangan)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── windows/
│   │   ├── TrayWindow.tsx   # flyout 320px
│   │   └── MainWindow.tsx   # app 920px
│   ├── PrayerRow.tsx        # §6.1
│   ├── QiblaCompass.tsx     # refaktor dari inline-style ke Tailwind
│   ├── Onboarding.tsx       # refaktor
│   ├── Settings.tsx         # refaktor
│   ├── LocationPicker.tsx   # → Command palette
│   └── icons/
│       └── Mosque.tsx       # brand icon
├── hooks/
│   ├── useTauriCommand.ts   # sudah ada, pertahankan
│   └── useSchedule.ts       # (opsional) ekstrak logic fetch jadwal
└── types/
    └── config.ts            # sudah ada
```

---

## 12. Rencana Migrasi (Fase)

Status quo: React + inline styles, 1 window 320×440. Target: multi-window + shadcn + glass.

### Fase 0 — Fondasi (no visual change)
1. Setup Tailwind v4 + shadcn init (§10).
2. Inject tokens + `.glass` utilities ke `index.css`.
3. `bun add class-variance-authority clsx tailwind-merge lucide-react sonner`.
4. Verifikasi `bun run build` lolos.

### Fase 1 — Komponen inti
5. `add` batch komponen (§10). Verifikasi tiap file.
6. Buat `PrayerRow.tsx` (§6.1), `icons/Mosque.tsx`.
7. Refaktor `QiblaCompass.tsx` ke Tailwind (hanya rotasi needle inline).

### Fase 2 — Multi-window
8. Tambah window `main` di `tauri.conf.json` (§2.1).
9. Update Rust `lib.rs`: handler tray click → toggle window `tray`; menu "Buka Aplikasi" / action di flyout → show window `main`.
10. Posisi window `tray` relatif ikon tray (§2.2).
11. Router window di `App.tsx` berdasarkan `getCurrentWebviewWindow().label`.

### Fase 3 — Refaktor per surface
12. `TrayWindow.tsx` — replika isi `popup-mac` mockup (clock, next prayer, quick actions).
13. `MainWindow.tsx` — replika `main-app-window` mockup (big clock, full schedule, action bar, footer).
14. `Onboarding.tsx` → Dialog/inline dalam window tray; pakai `RadioGroup`, `Slider`, `Switch`, `Command`.
15. `Settings.tsx` → Dialog; pakai `Card`, `Field`, `Slider`, `Switch`.

### Fase 4 — Detail & polish
16. Reminder popup → `Dialog` non-dismissable terikat event `prayer-reminder`.
17. Toast → ganti semua `showToast()` kustom ke `sonner`.
18. Empty/loading/error states (§9.4).
19. Dark mode `.dark` + ikut `prefers-color-scheme`.
20. Audit a11y: `DialogTitle` sr-only, `aria-invalid`, focus-trap Dialog, kontras warna.

### Fase 5 — Distribusi
21. Bundle font offline, optimasi bundle, smoke test `bun run tauri build`.

---

## 13. accessibility (a11y)

- Semua `Dialog`/`Sheet`/`Drawer` wajib `DialogTitle` (sr-only bila perlu) — aturan shadcn.
- Kontrol form: `aria-invalid` + `data-invalid` saat error; `aria-label` pada icon-only button.
- Waktu sholat & countdown: `aria-live="polite"` agar screen reader mengumumkan perubahan.
- Kibla compass: `aria-label` mendeskripsikan bearing (`"Arah kiblat 292 derajat dari utara"`).
- Kontras: brand `--primary` di atas `--primary-foreground` harus ≥ 4.5:1 (verifikasi di audit).

---

## 14. Referensi

- Mockup acuan: `docs/sholat-widget-mvp-mockup.html`
- Skill shadcn: aturan styling/forms/composition/icons (lihat `rules/*.md` di skill)
- Backend Tauri commands: `src-tauri/src/lib.rs` (`get_config`, `save_settings`, `get_today_schedule`, `get_qibla_bearing`, `search_cities`, `test_sound`, `complete_onboarding`)
- Config type: `src/types/config.ts`
- Existing hooks: `src/hooks/useTauriCommand.ts` (`useTauriCommand`, `useLiveClock`)
