# Sholat Widget MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (macOS/Windows) system-tray prayer-time reminder widget using Tauri (Rust backend) + React (webview native), with auto/manual location detection, NTP-synced accurate time, azan audio at -5 min before each prayer, and qibla direction.

**Architecture:** Tauri v2 app. Rust backend handles scheduling, API calls (myquran v3), NTP time sync, geolocation, audio playback, caching, and qibla calculation. React frontend renders the popup widget, onboarding wizard, settings panel, and qibla compass. Frontend never computes time itself — it always queries the Rust time service for the current accurate local time.

**Tech Stack:** Rust 1.95, Tauri v2, React + TypeScript, `rodio` (audio), `reqwest` + `serde` (HTTP/JSON), `tokio` (async), `chrono` + `rs-ntp` (time), `chrono-tz` (timezone DB). Bun for frontend tooling.

**Spec:** `docs/superpowers/specs/2026-07-03-sholat-widget-mvp-design.md`

---

## File Structure

### Rust backend (`src-tauri/src/`)

| File | Responsibility |
|---|---|
| `main.rs` | App entry, Tauri setup, tray registration, command registration, plugin wiring |
| `config.rs` | `Config` struct, load/save to JSON, defaults, corrupt-file recovery |
| `cache.rs` | Schedule + city list persistence, reminded-flags per prayer per day |
| `models.rs` | All shared serde structs: `PrayerTimes`, `City`, `JadwalResponse`, `GeoLocation`, `ResolvedLocation` |
| `api.rs` | HTTP client for myquran v3 + ip-api.com, all endpoints |
| `city.rs` | City list fetch/cache, search, fuzzy name matching, province→timezone mapping |
| `location.rs` | Auto-detect chain (IP → ip-api → cityId), manual resolve |
| `time.rs` | NTP sync, UTC→local timezone conversion, fallback chain, drift offset |
| `scheduler.rs` | Tokio task, 30s tick, reminder trigger at -5min, date-change handling |
| `audio.rs` | `rodio` player, volume control, mute, test play |
| `qibla.rs` | Bearing calculation (great-circle), compass reading if available |

### Frontend (`src/`)

| File | Responsibility |
|---|---|
| `App.tsx` | Root component, routing between Onboarding/Popup/Settings |
| `components/Onboarding.tsx` | 4-step wizard (welcome, location, volume, done) |
| `components/Popup.tsx` | Tray popup: live clock + prayer schedule + next-prayer countdown |
| `components/Settings.tsx` | Volume slider, mute toggle, location picker, auto-launch toggle |
| `components/LocationPicker.tsx` | Auto/Manual toggle + search box + city dropdown |
| `components/QiblaCompass.tsx` | Compass UI (if sensor) or static bearing number |
| `hooks/useTauriCommand.ts` | Generic hook wrapping `invoke()` with state |

### Assets & config

| Path | Content |
|---|---|
| `src-tauri/assets/sounds/azan.mp3` | User-provided azan audio |
| `src-tauri/assets/cities_fallback.json` | Top-50 Indonesian cities (offline fallback) |
| `src-tauri/icons/mosque.png` | Tray icon (mosque silhouette) |
| `src-tauri/tests/fixtures/*.json` | Real API response snapshots for contract tests |

---

## Task 1: Initialize Tauri + React Project (M1: Skeleton)

**Files:**
- Create: `package.json`, `src-tauri/`, `src/` (via scaffolder)
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Scaffold Tauri app with React + TypeScript**

```bash
cd /Users/nrmadi02/Desktop/Learn/sholat-widget
bun create tauri-app . --template react-ts --manager bun --identifier com.sholatwidget.app
```

Answer prompts: app name `sholat-widget`, window title `Sholat Widget`.

If the scaffolder refuses because the directory has existing files (`docs/`), move it temporarily:

```bash
mv docs /tmp/sholat_docs
bun create tauri-app . --template react-ts --manager bun --identifier com.sholatwidget.app
mv /tmp/sholat_docs docs
```

- [ ] **Step 2: Add Rust dependencies to `src-tauri/Cargo.toml`**

Append under `[dependencies]`:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
chrono-tz = "0.10"
rodio = "0.20"
rs-ntp = "0.2"
dirs = "5"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 3: Verify dev build runs**

```bash
bun install
cargo tauri dev
```

Expected: a window opens showing the default Tauri React welcome page. Stop with Ctrl+C.

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p src-tauri/src src-tauri/assets/sounds src-tauri/assets/icons
mkdir -p src-tauri/tests/fixtures
mkdir -p src/components src/hooks
```

- [ ] **Step 5: Init git and commit**

```bash
git init
echo '/node_modules
/src-tauri/target
/dist
.DS_Store' > .gitignore
git add -A
git commit -m "chore: scaffold Tauri + React project"
```

---

## Task 2: Shared Data Models (M2: API & Lokasi)

**Files:**
- Create: `src-tauri/src/models.rs`
- Test: `src-tauri/src/models.rs` (inline `#[cfg(test)]`)

- [ ] **Step 1: Write failing tests for model parsing**

Create `src-tauri/src/models.rs`:

```rust
use chrono::NaiveDate;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct City {
    pub id: String,
    #[serde(rename = "lokasi")]
    pub lokasi: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeoLocation {
    pub lat: f64,
    pub lon: f64,
    pub city: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrayerKind {
    Subuh,
    Dzuhur,
    Ashar,
    Maghrib,
    Isya,
}

impl PrayerKind {
    pub fn all() -> [PrayerKind; 5] {
        [PrayerKind::Subuh, PrayerKind::Dzuhur, PrayerKind::Ashar, PrayerKind::Maghrib, PrayerKind::Isya]
    }
    pub fn label(&self) -> &'static str {
        match self {
            PrayerKind::Subuh => "Subuh",
            PrayerKind::Dzuhur => "Dzuhur",
            PrayerKind::Ashar => "Ashar",
            PrayerKind::Maghrib => "Maghrib",
            PrayerKind::Isya => "Isya",
        }
    }
}

/// Raw jadwal entry as returned inside data.jadwal["YYYY-MM-DD"]
#[derive(Debug, Clone, Deserialize)]
pub struct JadwalEntry {
    pub tanggal: String,
    pub imsak: String,
    pub subuh: String,
    pub terbit: String,
    pub dhuha: String,
    pub dzuhur: String,
    pub ashar: String,
    pub maghrib: String,
    pub isya: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JadwalData {
    pub id: String,
    #[serde(rename = "kabko")]
    pub kabko: String,
    #[serde(rename = "prov")]
    pub prov: Option<String>,
    pub jadwal: std::collections::HashMap<String, JadwalEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JadwalResponse {
    pub status: bool,
    pub message: String,
    pub data: JadwalData,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IpResponse {
    pub status: bool,
    pub data: IpData,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IpData {
    pub ip: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CitiesResponse {
    pub status: bool,
    pub data: Vec<City>,
}

/// A single prayer time parsed into hour:minute for a specific date.
#[derive(Debug, Clone, PartialEq)]
pub struct PrayerTime {
    pub kind: PrayerKind,
    pub hour: u32,
    pub minute: u32,
}

impl PrayerTime {
    /// Parse "HH:MM" into PrayerTime with given kind.
    pub fn parse(kind: PrayerKind, s: &str) -> Option<Self> {
        let mut parts = s.split(':');
        let hour: u32 = parts.next()?.parse().ok()?;
        let minute: u32 = parts.next()?.parse().ok()?;
        Some(PrayerTime { kind, hour, minute })
    }
}

/// Location fully resolved: enough info to fetch schedule and convert time.
#[derive(Debug, Clone)]
pub struct ResolvedLocation {
    pub city_id: String,
    pub city_name: String,
    pub prov: Option<String>,
    pub timezone: String,
    pub lat: f64,
    pub lon: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_jadwal_response() {
        let json = r#"{
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
        }"#;
        let resp: JadwalResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.data.kabko, "KOTA KEDIRI");
        assert_eq!(resp.data.prov.as_deref(), Some("JAWA TIMUR"));
        let entry = resp.data.jadwal.get("2026-06-23").unwrap();
        assert_eq!(entry.subuh, "04:23");
        assert_eq!(entry.maghrib, "17:27");
    }

    #[test]
    fn test_parse_cities_response() {
        let json = r#"{"status":true,"data":[
            {"id":"c4ca4238a0b923820dcc509a6f75849b","lokasi":"KAB. ACEH BARAT"},
            {"id":"c81e728d9d4c2f636f067f89cc14862c","lokasi":"KAB. ACEH BARAT DAYA"}
        ]}"#;
        let resp: CitiesResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.data.len(), 2);
        assert_eq!(resp.data[0].id, "c4ca4238a0b923820dcc509a6f75849b");
    }

    #[test]
    fn test_prayer_time_parse() {
        let pt = PrayerTime::parse(PrayerKind::Subuh, "04:23").unwrap();
        assert_eq!(pt.hour, 4);
        assert_eq!(pt.minute, 23);
    }

    #[test]
    fn test_prayer_time_parse_invalid() {
        assert!(PrayerTime::parse(PrayerKind::Subuh, "invalid").is_none());
        assert!(PrayerTime::parse(PrayerKind::Subuh, "25:99").is_none() == false); // 25:99 parses but is invalid time — note: parse only checks format
    }
}
```

- [ ] **Step 2: Register module in `main.rs`**

Add to top of `src-tauri/src/main.rs`:

```rust
mod models;
```

- [ ] **Step 3: Run tests, verify pass**

```bash
cd src-tauri && cargo test models
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/main.rs
git commit -m "feat: add shared data models with API response structs"
```

---

## Task 3: Config Persistence (M2)

**Files:**
- Create: `src-tauri/src/config.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write failing test for config load/save**

Create `src-tauri/src/config.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LocationMode {
    Auto,
    ManualCity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub onboarding_done: bool,
    pub location_mode: LocationMode,
    pub city_id: String,
    pub city_name: String,
    pub timezone: String,
    pub last_lat_long: Option<(f64, f64)>,
    pub volume: f32,
    pub muted: bool,
    pub reminder_offset_minutes: i32,
    pub auto_launch: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            onboarding_done: false,
            location_mode: LocationMode::Auto,
            city_id: "eda80a3d5b344bc40f3bc04f65b7a357".to_string(), // Jakarta fallback
            city_name: "JAKARTA".to_string(),
            timezone: "Asia/Jakarta".to_string(),
            last_lat_long: None,
            volume: 0.7,
            muted: false,
            reminder_offset_minutes: -5,
            auto_launch: true,
        }
    }
}

/// Returns the config directory path, creating it if needed.
pub fn config_dir() -> PathBuf {
    let base = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("sholat-widget");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load_config() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Config>(&content) {
            Ok(cfg) => cfg,
            Err(_) => {
                // Corrupt: backup and use default
                let _ = fs::rename(&path, config_dir().join("config.corrupt.json"));
                Config::default()
            }
        },
        Err(_) => Config::default(),
    }
}

pub fn save_config(cfg: &Config) -> std::io::Result<()> {
    let path = config_path();
    let json = serde_json::to_string_pretty(cfg)?;
    fs::write(&path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = Config::default();
        assert!(!cfg.onboarding_done);
        assert_eq!(cfg.reminder_offset_minutes, -5);
        assert_eq!(cfg.volume, 0.7);
        assert!(!cfg.muted);
    }

    #[test]
    fn test_config_serialize_roundtrip() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg.onboarding_done, back.onboarding_done);
        assert_eq!(cfg.city_id, back.city_id);
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod config;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test config
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/main.rs
git commit -m "feat: add config persistence with corrupt-file recovery"
```

---

## Task 4: API Client (M2: API)

**Files:**
- Create: `src-tauri/src/api.rs`
- Create: `src-tauri/tests/fixtures/jadwal_response.json`
- Create: `src-tauri/tests/fixtures/kabkota_semua.json`
- Create: `src-tauri/tests/fixtures/kabkota_search.json`
- Create: `src-tauri/tests/api_test.rs`

- [ ] **Step 1: Capture real API fixtures**

```bash
curl -s "https://api.myquran.com/v3/sholat/jadwal/eda80a3d5b344bc40f3bc04f65b7a357/today?tz=Asia%2FJakarta" \
  > src-tauri/tests/fixtures/jadwal_response.json

curl -s "https://api.myquran.com/v3/sholat/kabkota/semua" \
  > src-tauri/tests/fixtures/kabkota_semua.json

curl -s "https://api.myquran.com/v3/sholat/kabkota/cari/kediri" \
  > src-tauri/tests/fixtures/kabkota_search.json
```

- [ ] **Step 2: Write the API client**

Create `src-tauri/src/api.rs`:

```rust
use crate::models::*;
use std::time::Duration;

const MYQURAN_BASE: &str = "https://api.myquran.com/v3";
const IP_API_BASE: &str = "http://ip-api.com/json";

pub struct ApiClient {
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client");
        ApiClient { client }
    }

    /// GET /tools/ip — returns the caller's public IP.
    pub async fn get_ip(&self) -> Result<String, reqwest::Error> {
        let resp: IpResponse = self.client
            .get(format!("{}/tools/ip", MYQURAN_BASE))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data.ip)
    }

    /// GET ip-api.com/json/{ip} — geolocate IP to coordinates + timezone.
    pub async fn geolocate_ip(&self, ip: &str) -> Result<GeoLocation, reqwest::Error> {
        let url = format!("{}/{}?fields=status,city,lat,lon,timezone", IP_API_BASE, ip);
        let resp: GeoLocation = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }

    /// GET /sholat/kabkota/semua — full city list.
    pub async fn get_all_cities(&self) -> Result<Vec<City>, reqwest::Error> {
        let resp: CitiesResponse = self.client
            .get(format!("{}/sholat/kabkota/semua", MYQURAN_BASE))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data)
    }

    /// GET /sholat/kabkota/cari/{query} — search cities by name.
    pub async fn search_cities(&self, query: &str) -> Result<Vec<City>, reqwest::Error> {
        let resp: Vec<City> = self.client
            .get(format!("{}/sholat/kabkota/cari/{}", MYQURAN_BASE, query))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp)
    }

    /// GET /sholat/jadwal/{kotaId}/today?tz={tz} — today's prayer schedule.
    pub async fn get_today_schedule(
        &self,
        city_id: &str,
        tz: &str,
    ) -> Result<JadwalResponse, reqwest::Error> {
        let url = format!(
            "{}/sholat/jadwal/{}/today?tz={}",
            MYQURAN_BASE, city_id, tz
        );
        let resp: JadwalResponse = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }

    /// GET /sholat/jadwal/{kotaId}/{date} — schedule for a specific date.
    pub async fn get_schedule_for_date(
        &self,
        city_id: &str,
        date: &str, // "YYYY-MM-DD"
    ) -> Result<JadwalResponse, reqwest::Error> {
        let url = format!(
            "{}/sholat/jadwal/{}/{}",
            MYQURAN_BASE, city_id, date
        );
        let resp: JadwalResponse = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }
}
```

- [ ] **Step 3: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod api;
```

- [ ] **Step 4: Write contract tests against fixtures**

Create `src-tauri/tests/api_test.rs`:

```rust
use sholat_widget::models::*;

#[test]
fn test_jadwal_fixture_parses() {
    let json = include_str!("fixtures/jadwal_response.json");
    let resp: JadwalResponse = serde_json::from_str(json)
        .expect("jadwal fixture should parse");
    assert!(resp.status);
    assert!(!resp.data.kabko.is_empty());
    // Should have at least one date entry
    assert!(!resp.data.jadwal.is_empty());
}

#[test]
fn test_kabkota_semua_fixture_parses() {
    let json = include_str!("fixtures/kabkota_semua.json");
    let resp: CitiesResponse = serde_json::from_str(json)
        .expect("kabkota semaa fixture should parse");
    assert!(resp.status);
    assert!(resp.data.len() > 100); // Indonesia has 500+ cities
}

#[test]
fn test_kabkota_search_fixture_parses() {
    let json = include_str!("fixtures/kabkota_search.json");
    let cities: Vec<City> = serde_json::from_str(json)
        .expect("kabkota search fixture should parse");
    assert!(cities.iter().any(|c| c.lokasi.contains("KEDIRI")));
}
```

Note: the test references `sholat_widget::models` — the crate name must match `Cargo.toml` `[package].name`. Check it:

```bash
grep 'name = ' src-tauri/Cargo.toml | head -1
```

If the package name differs (e.g. `sholat-widget`), adjust the import path accordingly or rename in test.

- [ ] **Step 5: Run contract tests**

```bash
cd src-tauri && cargo test --test api_test
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/api.rs src-tauri/tests/
git commit -m "feat: add myquran + ip-api client with fixture contract tests"
```

---

## Task 5: City Service & Province→Timezone Mapping (M2)

**Files:**
- Create: `src-tauri/src/city.rs`
- Create: `src-tauri/assets/cities_fallback.json`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write failing tests for fuzzy match + timezone mapping**

Create `src-tauri/src/city.rs`:

```rust
use crate::models::City;

/// Normalize a city name for fuzzy comparison:
/// uppercase, trim, remove "KOTA "/"KAB. " prefix, collapse spaces.
pub fn normalize_city_name(name: &str) -> String {
    let upper = name.to_uppercase().trim().to_string();
    // Remove common prefixes so "KOTA BANJARMASIN" matches "BANJARMASIN"
    let stripped = upper
        .strip_prefix("KOTA ")
        .or_else(|| upper.strip_prefix("KAB. "))
        .or_else(|| upper.strip_prefix("KABUPATEN "))
        .unwrap_or(&upper);
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Find the best-matching city from a list by name similarity.
/// Returns the city whose normalized name equals or contains the query.
pub fn match_city<'a>(query: &str, cities: &'a [City]) -> Option<&'a City> {
    let q = normalize_city_name(query);
    // Exact match first
    if let Some(c) = cities.iter().find(|c| normalize_city_name(&c.lokasi) == q) {
        return Some(c);
    }
    // Contains match (query is substring of city name or vice versa)
    cities.iter().find(|c| {
        let n = normalize_city_name(&c.lokasi);
        n.contains(&q) || q.contains(&n)
    })
}

// --- Province → Timezone mapping (for ManualCity mode) ---

const WITA_PROVINCES: &[&str] = &[
    "BALI", "NUSA TENGGARA BARAT", "NUSA TENGGARA TIMUR",
    "SULAWESI UTARA", "SULAWESI TENGAH", "SULAWESI SELATAN",
    "SULAWESI TENGGARA", "SULAWESI BARAT", "GORONTALO",
    "KALIMANTAN TENGAH", "KALIMANTAN SELATAN", "KALIMANTAN TIMUR",
    "KALIMANTAN UTARA",
];

const WIT_PROVINCES: &[&str] = &[
    "MALUKU", "MALUKU UTARA", "PAPUA", "PAPUA BARAT",
    "PAPUA SELATAN", "PAPUA TENGAH", "PAPUA PEGUNUNGAN",
    "PAPUA BARAT DAYA",
];

/// Map a province name (as returned by API `prov` field) to IANA timezone.
pub fn prov_to_timezone(prov: &str) -> &'static str {
    let p = prov.to_uppercase().trim().to_string();
    if WITA_PROVINCES.contains(&p.as_str()) {
        "Asia/Makassar"
    } else if WIT_PROVINCES.contains(&p.as_str()) {
        "Asia/Jayapura"
    } else {
        "Asia/Jakarta" // default WIB
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_strips_prefix() {
        assert_eq!(normalize_city_name("Kota Banjarmasin"), "BANJARMASIN");
        assert_eq!(normalize_city_name("KAB. Kediri"), "KEDIRI");
        assert_eq!(normalize_city_name("  Jakarta  "), "JAKARTA");
    }

    #[test]
    fn test_match_city_exact() {
        let cities = vec![
            City { id: "1".into(), lokasi: "KOTA KEDIRI".into() },
            City { id: "2".into(), lokasi: "KAB. KEDIRI".into() },
        ];
        let m = match_city("Kediri", &cities);
        assert!(m.is_some());
        assert_eq!(m.unwrap().id, "1"); // first match
    }

    #[test]
    fn test_match_city_ip_api_variant() {
        // ip-api returns "Kota Banjarmasin", myquran has "KOTA BANJARMASIN"
        let cities = vec![
            City { id: "1".into(), lokasi: "KOTA BANJARMASIN".into() },
        ];
        let m = match_city("Kota Banjarmasin", &cities);
        assert!(m.is_some());
    }

    #[test]
    fn test_prov_to_timezone_wib() {
        assert_eq!(prov_to_timezone("JAWA TIMUR"), "Asia/Jakarta");
        assert_eq!(prov_to_timezone("DKI JAKARTA"), "Asia/Jakarta");
    }

    #[test]
    fn test_prov_to_timezone_wita() {
        assert_eq!(prov_to_timezone("SULAWESI SELATAN"), "Asia/Makassar");
        assert_eq!(prov_to_timezone("BALI"), "Asia/Makassar");
        assert_eq!(prov_to_timezone("KALIMANTAN TIMUR"), "Asia/Makassar");
    }

    #[test]
    fn test_prov_to_timezone_wit() {
        assert_eq!(prov_to_timezone("PAPUA"), "Asia/Jayapura");
        assert_eq!(prov_to_timezone("MALUKU UTARA"), "Asia/Jayapura");
    }
}
```

- [ ] **Step 2: Create fallback cities file**

Create `src-tauri/assets/cities_fallback.json` with the top cities (fetch real data and trim):

```bash
curl -s "https://api.myquran.com/v3/sholat/kabkota/semua" | \
  jq '.data[0:50]' > src-tauri/assets/cities_fallback.json
```

- [ ] **Step 3: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod city;
```

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test city
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/city.rs src-tauri/assets/cities_fallback.json src-tauri/src/main.rs
git commit -m "feat: add city matching and province→timezone mapping"
```

---

## Task 6: Location Service (M2: Lokasi)

**Files:**
- Create: `src-tauri/src/location.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write the location service with chain logic**

Create `src-tauri/src/location.rs`:

```rust
use crate::api::ApiClient;
use crate::city::{match_city, normalize_city_name};
use crate::models::*;
use std::error::Error;

/// Full auto-detect chain: IP → geolocate → search city → resolve.
pub async fn auto_detect(
    api: &ApiClient,
    cached_cities: &[City],
) -> Result<ResolvedLocation, Box<dyn Error + Send + Sync>> {
    // Step 1: get public IP
    let ip = api.get_ip().await?;

    // Step 2: geolocate IP
    let geo = api.geolocate_ip(&ip).await?;

    // Step 3: find cityId from cached list or live search
    let city = if let Some(c) = match_city(&geo.city, cached_cities) {
        c.clone()
    } else {
        // Fallback: live search
        let results = api.search_cities(&geo.city).await?;
        match_city(&geo.city, &results)
            .cloned()
            .ok_or("could not match city from geolocation")?
    };

    Ok(ResolvedLocation {
        city_id: city.id,
        city_name: city.lokasi,
        prov: None, // will be filled when jadwal is fetched
        timezone: geo.timezone,
        lat: geo.lat,
        lon: geo.lon,
    })
}

/// Resolve a manually-selected city to a ResolvedLocation.
/// Timezone is derived from province (fetched from jadwal response).
pub async fn resolve_manual(
    api: &ApiClient,
    city: &City,
) -> Result<ResolvedLocation, Box<dyn Error + Send + Sync>> {
    // Fetch today's schedule to get the `prov` field
    let jadwal = api.get_today_schedule(&city.id, "Asia/Jakarta").await?;
    let prov = jadwal.data.prov.clone();
    let timezone = match &prov {
        Some(p) => crate::city::prov_to_timezone(p).to_string(),
        None => "Asia/Jakarta".to_string(),
    };

    Ok(ResolvedLocation {
        city_id: city.id.clone(),
        city_name: city.lokasi.clone(),
        prov,
        timezone,
        lat: 0.0, // unknown in manual mode
        lon: 0.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolved_location_fields() {
        let loc = ResolvedLocation {
            city_id: "123".into(),
            city_name: "KOTA KEDIRI".into(),
            prov: Some("JAWA TIMUR".into()),
            timezone: "Asia/Jakarta".into(),
            lat: -7.0,
            lon: 112.0,
        };
        assert_eq!(loc.timezone, "Asia/Jakarta");
        assert_eq!(loc.city_name, "KOTA KEDIRI");
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod location;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test location
```

Expected: 1 test passes (unit-level; chain is integration-tested manually).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/location.rs src-tauri/src/main.rs
git commit -m "feat: add location auto-detect and manual resolve"
```

---

## Task 7: Time Service with NTP (M4: Time Service)

**Files:**
- Create: `src-tauri/src/time.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write failing tests for timezone conversion**

Create `src-tauri/src/time.rs`:

```rust
use chrono::{DateTime, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct TimeService {
    /// Last known accurate UTC time from NTP (if synced).
    ntp_utc: Arc<Mutex<Option<DateTime<Utc>>>>,
    /// When the last NTP sync happened.
    last_sync: Arc<Mutex<Option<Instant>>>,
    /// Offset between OS clock and NTP (ntp_utc - os_utc_at_sync).
    /// Used to correct OS clock drift between syncs.
    offset_drift: Arc<Mutex<chrono::Duration>>,
    /// Target timezone (e.g. "Asia/Jakarta").
    timezone: Arc<Mutex<Tz>>,
}

impl TimeService {
    pub fn new(timezone_str: &str) -> Self {
        let tz: Tz = timezone_str
            .parse()
            .unwrap_or_else(|_| "Asia/Jakarta".parse().unwrap());
        TimeService {
            ntp_utc: Arc::new(Mutex::new(None)),
            last_sync: Arc::new(Mutex::new(None)),
            offset_drift: Arc::new(Mutex::new(chrono::Duration::zero())),
            timezone: Arc::new(Mutex::new(tz)),
        }
    }

    pub fn update_timezone(&self, timezone_str: &str) {
        if let Ok(tz) = timezone_str.parse::<Tz>() {
            *self.timezone.lock().unwrap() = tz;
        }
    }

    /// Attempt NTP sync. On failure, leaves offset unchanged.
    pub async fn sync_ntp(&self) -> Result<(), String> {
        // Query pool.ntp.org via rs-ntp UDP client
        let result = rs_ntp::client::SntpClient::new()
            .sntp_query("pool.ntp.org", 123)
            .await
            .map_err(|e| format!("NTP query failed: {}", e))?;

        let ntp_time = DateTime::<Utc>::from(result.datetime());
        let os_time = Utc::now();
        let drift = ntp_time - os_time;

        *self.ntp_utc.lock().unwrap() = Some(ntp_time);
        *self.offset_drift.lock().unwrap() = drift;
        *self.last_sync.lock().unwrap() = Some(Instant::now());
        Ok(())
    }

    /// Returns true if NTP has synced within the last 24 hours.
    pub fn is_synced(&self) -> bool {
        if let Some(last) = *self.last_sync.lock().unwrap() {
            last.elapsed() < Duration::from_secs(86400)
        } else {
            false
        }
    }

    /// Current accurate local time in the configured timezone.
    /// Falls back to OS clock + drift offset if NTP unavailable.
    pub fn now_local(&self) -> DateTime<Tz> {
        let os_utc = Utc::now();
        let corrected_utc = os_utc + *self.offset_drift.lock().unwrap();
        let tz = *self.timezone.lock().unwrap();
        corrected_utc.with_timezone(&tz)
    }

    /// Whether time is unverified (NTP never synced and no recent sync).
    pub fn is_unverified(&self) -> bool {
        !self.is_synced()
    }
}

/// Parse "HH:MM" into a NaiveTime.
pub fn parse_time(s: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M").ok()
}

/// Check if current local time has crossed a reminder threshold
/// (now >= prayer_time - 5min AND now < prayer_time).
pub fn is_in_reminder_window(
    now: DateTime<Tz>,
    prayer_hour: u32,
    prayer_min: u32,
    offset_minutes: i32,
) -> bool {
    let prayer = now
        .timezone()
        .with_ymd_and_hms(now.year(), now.month(), now.day(), prayer_hour, prayer_min, 0)
        .single();
    if let Some(prayer_dt) = prayer {
        let reminder = prayer_dt + chrono::Duration::minutes(offset_minutes as i64);
        now >= reminder && now < prayer_dt
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utc_to_jakarta() {
        let utc = "2026-06-23T03:23:00Z".parse::<DateTime<Utc>>().unwrap();
        let jakarta: Tz = "Asia/Jakarta".parse().unwrap();
        let local = utc.with_timezone(&jakarta);
        assert_eq!(local.hour(), 10);
        assert_eq!(local.minute(), 23);
    }

    #[test]
    fn test_utc_to_makassar() {
        let utc = "2026-06-23T03:23:00Z".parse::<DateTime<Utc>>().unwrap();
        let makassar: Tz = "Asia/Makassar".parse().unwrap();
        let local = utc.with_timezone(&makassar);
        assert_eq!(local.hour(), 11);
        assert_eq!(local.minute(), 23);
    }

    #[test]
    fn test_parse_time_valid() {
        let t = parse_time("04:23").unwrap();
        assert_eq!(t.hour(), 4);
        assert_eq!(t.minute(), 23);
    }

    #[test]
    fn test_parse_time_invalid() {
        assert!(parse_time("invalid").is_none());
    }

    #[test]
    fn test_is_in_reminder_window_true() {
        let tz: Tz = "Asia/Jakarta".parse().unwrap();
        // Prayer at 12:15, reminder at 12:10
        let now = tz.with_ymd_and_hms(2026, 6, 23, 12, 10, 0).single().unwrap();
        assert!(is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_is_in_reminder_window_false_before() {
        let tz: Tz = "Asia/Jakarta".parse().unwrap();
        // 12:09 — too early
        let now = tz.with_ymd_and_hms(2026, 6, 23, 12, 9, 0).single().unwrap();
        assert!(!is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_is_in_reminder_window_false_after() {
        let tz: Tz = "Asia/Jakarta".parse().unwrap();
        // 12:16 — already past
        let now = tz.with_ymd_and_hms(2026, 6, 23, 12, 16, 0).single().unwrap();
        assert!(!is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_timeservice_new_default_tz() {
        let ts = TimeService::new("Asia/Jakarta");
        let local = ts.now_local();
        // Just verify it returns something in Jakarta tz
        assert_eq!(local.timezone().to_string(), "Asia/Jakarta");
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod time;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test time
```

Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/time.rs src-tauri/src/main.rs
git commit -m "feat: add NTP-synced time service with timezone conversion"
```

---

## Task 8: Cache Store (M2: Data)

**Files:**
- Create: `src-tauri/src/cache.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write the cache module**

Create `src-tauri/src/cache.rs`:

```rust
use crate::models::{City, JadwalEntry, PrayerKind};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCache {
    /// Keyed by "YYYY-MM-DD"
    pub schedules: HashMap<String, JadwalEntry>,
    /// City ID these schedules belong to
    pub city_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemindedFlags {
    /// Key: "YYYY-MM-DD:PrayerKind" e.g. "2026-06-23:Maghrib"
    pub reminded: HashSet<String>,
}

pub struct CacheStore {
    dir: PathBuf,
}

impl CacheStore {
    pub fn new() -> Self {
        let dir = crate::config::config_dir().join("cache");
        let _ = fs::create_dir_all(&dir);
        CacheStore { dir }
    }

    fn schedule_path(&self) -> PathBuf {
        self.dir.join("schedules.json")
    }

    fn reminded_path(&self) -> PathBuf {
        self.dir.join("reminded.json")
    }

    fn cities_path(&self) -> PathBuf {
        self.dir.join("cities.json")
    }

    pub fn load_schedule(&self) -> Option<ScheduleCache> {
        let json = fs::read_to_string(self.schedule_path()).ok()?;
        serde_json::from_str(&json).ok()
    }

    pub fn save_schedule(&self, cache: &ScheduleCache) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(cache)?;
        fs::write(self.schedule_path(), json)?;
        Ok(())
    }

    /// Get today's schedule entry, if cached.
    pub fn get_today_schedule(&self) -> Option<JadwalEntry> {
        let cache = self.load_schedule()?;
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        cache.schedules.get(&today).cloned()
    }

    pub fn load_reminded(&self) -> RemindedFlags {
        match fs::read_to_string(self.reminded_path()) {
            Ok(json) => serde_json::from_str(&json).unwrap_or(RemindedFlags {
                reminded: HashSet::new(),
            }),
            Err(_) => RemindedFlags {
                reminded: HashSet::new(),
            },
        }
    }

    pub fn save_reminded(&self, flags: &RemindedFlags) -> std::io::Result<()> {
        let json = serde_json::to_string(flags)?;
        fs::write(self.reminded_path(), json)?;
        Ok(())
    }

    /// Mark a prayer as reminded for a specific date.
    pub fn mark_reminded(
        &self,
        date: NaiveDate,
        kind: PrayerKind,
    ) -> std::io::Result<()> {
        let mut flags = self.load_reminded();
        let key = format!("{}:{}", date.format("%Y-%m-%d"), kind.label());
        flags.reminded.insert(key);
        self.save_reminded(&flags)
    }

    /// Check if a prayer was already reminded today.
    pub fn is_reminded(&self, date: NaiveDate, kind: PrayerKind) -> bool {
        let flags = self.load_reminded();
        let key = format!("{}:{}", date.format("%Y-%m-%d"), kind.label());
        flags.reminded.contains(&key)
    }

    /// Clear reminded flags older than today (housekeeping).
    pub fn cleanup_old_flags(&self) -> std::io::Result<()> {
        let mut flags = self.load_reminded();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        flags.reminded.retain(|k| k.starts_with(&today));
        self.save_reminded(&flags)
    }

    pub fn load_cities(&self) -> Vec<City> {
        match fs::read_to_string(self.cities_path()) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    pub fn save_cities(&self, cities: &[City]) -> std::io::Result<()> {
        let json = serde_json::to_string(cities)?;
        fs::write(self.cities_path(), json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reminded_key_format() {
        let date = NaiveDate::from_ymd_opt(2026, 6, 23).unwrap();
        let key = format!("{}:{}", date.format("%Y-%m-%d"), PrayerKind::Maghrib.label());
        assert_eq!(key, "2026-06-23:Maghrib");
    }

    #[test]
    fn test_reminded_set_dedup() {
        let mut set: HashSet<String> = HashSet::new();
        set.insert("2026-06-23:Maghrib".into());
        set.insert("2026-06-23:Maghrib".into()); // dup
        assert_eq!(set.len(), 1);
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod cache;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test cache
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cache.rs src-tauri/src/main.rs
git commit -m "feat: add schedule and reminded-flags cache store"
```

---

## Task 9: Audio Player (M3: Audio)

**Files:**
- Create: `src-tauri/src/audio.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write the audio player**

Create `src-tauri/src/audio.rs`:

```rust
use rodio::{source::Source, Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::BufReader;
use std::sync::Mutex;

pub struct AudioPlayer {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    /// Volume 0.0–1.0 (app-level). Mute overrides to 0.
    volume: Mutex<f32>,
    muted: Mutex<bool>,
}

impl AudioPlayer {
    pub fn new() -> Self {
        let (stream, handle) = OutputStream::try_default()
            .expect("failed to open default audio output");
        AudioPlayer {
            _stream: stream,
            handle,
            volume: Mutex::new(0.7),
            muted: Mutex::new(false),
        }
    }

    pub fn set_volume(&self, vol: f32) {
        *self.volume.lock().unwrap() = vol.clamp(0.0, 1.0);
    }

    pub fn set_muted(&self, muted: bool) {
        *self.muted.lock().unwrap() = muted;
    }

    pub fn is_muted(&self) -> bool {
        *self.muted.lock().unwrap()
    }

    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    /// Play an audio file. Returns error if file missing/unsupported.
    /// If muted, returns Ok without playing.
    pub fn play(&self, path: &str) -> Result<(), String> {
        if *self.muted.lock().unwrap() {
            return Ok(());
        }
        let file = File::open(path).map_err(|e| format!("audio file open: {}", e))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("audio decode: {}", e))?;

        let sink = Sink::try_new(&self.handle).map_err(|e| format!("sink: {}", e))?;
        let vol = *self.volume.lock().unwrap();
        sink.set_volume(vol);
        sink.append(source);
        sink.detach(); // play in background
        Ok(())
    }

    /// Convenience: play the bundled azan asset.
    pub fn play_azan(&self) -> Result<(), String> {
        let path = azan_path();
        self.play(&path)
    }
}

/// Resolve the azan audio path from bundled assets.
/// At runtime in Tauri, assets resolve via the app resource dir.
pub fn azan_path() -> String {
    // In dev: relative to CWD. In prod: Tauri resource dir.
    // This is refined in the Tauri integration task.
    "src-tauri/assets/sounds/azan.mp3".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_clamp() {
        let player = AudioPlayer::new();
        player.set_volume(1.5);
        assert_eq!(player.get_volume(), 1.0);
        player.set_volume(-0.5);
        assert_eq!(player.get_volume(), 0.0);
        player.set_volume(0.5);
        assert_eq!(player.get_volume(), 0.5);
    }

    #[test]
    fn test_mute_toggle() {
        let player = AudioPlayer::new();
        assert!(!player.is_muted());
        player.set_muted(true);
        assert!(player.is_muted());
    }

    #[test]
    fn test_play_when_muted_is_ok() {
        let player = AudioPlayer::new();
        player.set_muted(true);
        // Muted play returns Ok without touching file
        let result = player.play("nonexistent.mp3");
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod audio;
```

- [ ] **Step 3: Add a placeholder azan sound for testing**

Download a short public-domain bell/azan-like sound (or create a silent placeholder):

```bash
# Placeholder: generate a 1-second silent wav if no real file yet
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 src-tauri/assets/sounds/azan.mp3 2>/dev/null \
  || echo "ffmpeg not found; user will provide azan.mp3 later"
```

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test audio
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio.rs src-tauri/src/main.rs src-tauri/assets/sounds/
git commit -m "feat: add rodio audio player with volume and mute control"
```

---

## Task 10: Scheduler (M3: Scheduler)

**Files:**
- Create: `src-tauri/src/scheduler.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write the scheduler with reminder logic**

Create `src-tauri/src/scheduler.rs`:

```rust
use crate::audio::AudioPlayer;
use crate::cache::CacheStore;
use crate::config::{load_config, Config};
use crate::models::{JadwalEntry, PrayerKind};
use crate::time::{is_in_reminder_window, TimeService};
use chrono::{Datelike, NaiveDate};
use std::sync::Arc;
use tokio::time::{sleep, Duration};

/// Extract the 5 prayer times from a JadwalEntry.
pub fn extract_prayers(entry: &JadwalEntry) -> Vec<(PrayerKind, &str)> {
    vec![
        (PrayerKind::Subuh, entry.subuh.as_str()),
        (PrayerKind::Dzuhur, entry.dzuhur.as_str()),
        (PrayerKind::Ashar, entry.ashar.as_str()),
        (PrayerKind::Maghrib, entry.maghrib.as_str()),
        (PrayerKind::Isya, entry.isya.as_str()),
    ]
}

/// Parse "HH:MM" to (hour, minute). Returns None if invalid.
pub fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let mut parts = s.split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h < 24 && m < 60 {
        Some((h, m))
    } else {
        None
    }
}

/// The main scheduler loop. Runs as a tokio task.
/// Checks every 30 seconds; triggers audio + popup at -5 min before each prayer.
pub async fn run_scheduler(
    time_service: Arc<TimeService>,
    audio: Arc<AudioPlayer>,
    cache: Arc<CacheStore>,
    on_remind: Arc<dyn Fn(PrayerKind) + Send + Sync>,
) {
    let mut last_date: Option<NaiveDate> = None;

    loop {
        let now = time_service.now_local();
        let today = now.date_naive();

        // Detect date change: fetch new schedule + reset old flags
        if last_date != Some(today) {
            // Cleanup flags from previous days
            let _ = cache.cleanup_old_flags();
            last_date = Some(today);
        }

        // Load today's schedule from cache
        if let Some(entry) = cache.get_today_schedule() {
            let cfg = load_config();
            let offset = cfg.reminder_offset_minutes;

            for (kind, time_str) in extract_prayers(&entry) {
                if let Some((h, m)) = parse_hhmm(time_str) {
                    let already = cache.is_reminded(today, kind);
                    let in_window = is_in_reminder_window(now, h, m, offset);

                    if in_window && !already {
                        // Trigger reminder
                        let _ = audio.play_azan();
                        on_remind(kind);
                        let _ = cache.mark_reminded(today, kind);
                    }
                }
            }
        }

        sleep(Duration::from_secs(30)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::JadwalEntry;

    fn sample_entry() -> JadwalEntry {
        JadwalEntry {
            tanggal: "Selasa, 23/06/2026".into(),
            imsak: "04:13".into(),
            subuh: "04:23".into(),
            terbit: "05:41".into(),
            dhuha: "06:10".into(),
            dzuhur: "11:38".into(),
            ashar: "14:57".into(),
            maghrib: "17:27".into(),
            isya: "18:42".into(),
        }
    }

    #[test]
    fn test_extract_prayers_count() {
        let entry = sample_entry();
        let prayers = extract_prayers(&entry);
        assert_eq!(prayers.len(), 5);
    }

    #[test]
    fn test_extract_prayers_values() {
        let entry = sample_entry();
        let prayers = extract_prayers(&entry);
        let subuh = prayers.iter().find(|(k, _)| *k == PrayerKind::Subuh).unwrap();
        assert_eq!(subuh.1, "04:23");
    }

    #[test]
    fn test_parse_hhmm_valid() {
        assert_eq!(parse_hhmm("04:23"), Some((4, 23)));
        assert_eq!(parse_hhmm("00:00"), Some((0, 0)));
        assert_eq!(parse_hhmm("23:59"), Some((23, 59)));
    }

    #[test]
    fn test_parse_hhmm_invalid() {
        assert_eq!(parse_hhmm("24:00"), None);
        assert_eq!(parse_hhmm("12:60"), None);
        assert_eq!(parse_hhmm("abc"), None);
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod scheduler;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test scheduler
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/scheduler.rs src-tauri/src/main.rs
git commit -m "feat: add prayer-time scheduler with -5min reminder trigger"
```

---

## Task 11: Qibla Bearing Calculation (M6: Qibla)

**Files:**
- Create: `src-tauri/src/qibla.rs`
- Test: inline `#[cfg(test)]`

- [ ] **Step 1: Write failing tests for bearing calculation**

Create `src-tauri/src/qibla.rs`:

```rust
/// Kaaba coordinates (Mecca).
pub const KAABA_LAT: f64 = 21.4225;
pub const KAABA_LON: f64 = 39.8262;

/// Calculate the initial bearing (great-circle) from a point to the Kaaba.
/// Returns bearing in degrees [0, 360) where 0 = North, 90 = East.
/// Formula: https://www.movable-type.co.uk/scripts/latlong.html
pub fn qibla_bearing(lat: f64, lon: f64) -> f64 {
    let phi1 = lat.to_radians();
    let phi2 = KAABA_LAT.to_radians();
    let delta_lambda = (KAABA_LON - lon).to_radians();

    let y = delta_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.tan() - phi1.sin() * phi2.cos() * delta_lambda.cos();

    let theta = y.atan2(x);
    let bearing_deg = theta.to_degrees();
    (bearing_deg + 360.0) % 360.0
}

/// Normalize a compass heading to [0, 360).
pub fn normalize_heading(h: f64) -> f64 {
    ((h % 360.0) + 360.0) % 360.0
}

/// The direction the user should face, relative to their current heading.
/// E.g. if facing North (0) and qibla is 295, result is 295 (turn West-Northwest).
pub fn relative_direction(current_heading: f64, qibla: f64) -> f64 {
    let diff = qibla - normalize_heading(current_heading);
    ((diff + 540.0) % 360.0) - 180.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qibla_bearing_from_jakarta() {
        // Jakarta: -6.2088, 106.8456
        // Expected ~295° (West-Northwest)
        let bearing = qibla_bearing(-6.2088, 106.8456);
        assert!(bearing > 290.0 && bearing < 300.0,
            "Jakarta qibla bearing should be ~295°, got {}", bearing);
    }

    #[test]
    fn test_qibla_bearing_from_banjarmasin() {
        // Banjarmasin: -3.3186, 114.5944
        let bearing = qibla_bearing(-3.3186, 114.5944);
        assert!(bearing > 290.0 && bearing < 300.0,
            "Banjarmasin qibla bearing should be ~295°, got {}", bearing);
    }

    #[test]
    fn test_qibla_bearing_from_mecca() {
        // From the Kaaba itself, bearing is undefined but formula should not panic
        let bearing = qibla_bearing(KAABA_LAT, KAABA_LON);
        assert!(bearing >= 0.0 && bearing < 360.0);
    }

    #[test]
    fn test_normalize_heading() {
        assert_eq!(normalize_heading(370.0), 10.0);
        assert_eq!(normalize_heading(-10.0), 350.0);
        assert_eq!(normalize_heading(0.0), 0.0);
    }

    #[test]
    fn test_relative_direction() {
        // Facing North, qibla 295 → turn -65 (left)
        let rel = relative_direction(0.0, 295.0);
        assert_eq!(rel, -65.0);
    }
}
```

- [ ] **Step 2: Register module**

Add to `src-tauri/src/main.rs`:

```rust
mod qibla;
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test qibla
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/qibla.rs src-tauri/src/main.rs
git commit -m "feat: add qibla bearing calculation with great-circle formula"
```

---

## Task 12: Tauri Integration — Tray + Commands (M1/M5)

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add Tauri plugins to Cargo.toml**

Add under `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: Create a tray mosque icon**

Generate a simple 32x32 mosque silhouette PNG (or use an icon generator). Place at:

```
src-tauri/icons/mosque.png
```

If no icon asset is available yet, copy the default Tauri icon as placeholder:

```bash
cp src-tauri/icons/icon.png src-tauri/icons/mosque.png 2>/dev/null || true
```

- [ ] **Step 3: Write the Tauri command handlers + tray setup**

Replace the body of `src-tauri/src/main.rs` (keeping the `mod` declarations) with:

```rust
// Keep all mod declarations at top:
mod models;
mod config;
mod api;
mod city;
mod location;
mod time;
mod cache;
mod audio;
mod scheduler;
mod qibla;

use audio::AudioPlayer;
use cache::CacheStore;
use config::{load_config, save_config, Config};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

#[tauri::command]
fn save_settings(config: Config) -> Result<(), String> {
    save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_current_time() -> String {
    let cfg = load_config();
    let ts = time::TimeService::new(&cfg.timezone);
    ts.now_local().format("%H:%M:%S").to_string()
}

#[tauri::command]
fn get_qibla_bearing(lat: f64, lon: f64) -> f64 {
    qibla::qibla_bearing(lat, lon)
}

#[tauri::command]
fn complete_onboarding(config: Config) -> Result<(), String> {
    let mut cfg = config;
    cfg.onboarding_done = true;
    save_config(&cfg).map_err(|e| e.to_string())
}

#[tauri::command]
fn test_sound() -> Result<(), String> {
    let player = AudioPlayer::new();
    player.play_azan()
}

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            // --- Tray icon ---
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Sholat Widget")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // --- Auto-launch ---
            let cfg = load_config();
            if cfg.auto_launch {
                let _ = app.autolaunch().enable();
            }

            // --- Start scheduler ---
            let time_service = Arc::new(time::TimeService::new(&cfg.timezone));
            let audio = Arc::new(AudioPlayer::new());
            let cache = Arc::new(CacheStore::new());

            let ts_clone = time_service.clone();
            let app_handle = app.handle().clone();
            let on_remind = Arc::new(move |kind: models::PrayerKind| {
                let _ = app_handle.emit("prayer-reminder", kind.label());
            });

            tauri::async_runtime::spawn(scheduler::run_scheduler(
                ts_clone, audio, cache, on_remind,
            ));

            // NTP sync at startup + hourly
            let ts_bg = time_service.clone();
            tauri::async_runtime::spawn(async move {
                let _ = ts_bg.sync_ntp().await;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    let _ = ts_bg.sync_ntp().await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            get_current_time,
            get_qibla_bearing,
            complete_onboarding,
            test_sound,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Configure window in `tauri.conf.json`**

Open `src-tauri/tauri.conf.json` and ensure the `app.windows[0]` has these properties:

```json
{
  "label": "main",
  "title": "Sholat Widget",
  "width": 320,
  "height": 440,
  "resizable": false,
  "decorations": false,
  "transparent": true,
  "visible": true
}
```

- [ ] **Step 5: Verify it builds**

```bash
cargo tauri build --debug 2>&1 | tail -5
```

Expected: builds successfully (warnings OK, errors not OK). Fix any compilation errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: integrate Tauri tray, commands, scheduler, and autostart"
```

---

## Task 13: React Frontend — Hooks & Popup (M5)

**Files:**
- Create: `src/hooks/useTauriCommand.ts`
- Create: `src/components/Popup.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the Tauri command hook**

Create `src/hooks/useTauriCommand.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/**
 * Generic hook to invoke a Tauri command and hold its result.
 */
export function useTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<T>(command, args)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [command, JSON.stringify(args)]);

  return { data, error };
}
```

- [ ] **Step 2: Create the live clock hook**

Add to `src/hooks/useTauriCommand.ts`:

```typescript
/**
 * Polls the Rust time service every second for accurate local time.
 * Uses NTP-synced time, NOT browser Date.now().
 */
export function useLiveClock() {
  const [time, setTime] = useState<string>("--:--:--");

  useEffect(() => {
    const fetchTime = () => {
      invoke<string>("get_current_time")
        .then(setTime)
        .catch(() => setTime("--:--:--"));
    };
    fetchTime();
    const interval = setInterval(fetchTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}
```

- [ ] **Step 3: Create the Popup component**

Create `src/components/Popup.tsx`:

```typescript
import { useLiveClock, useTauriCommand } from "../hooks/useTauriCommand";

interface PrayerSchedule {
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
}

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

const PRAYERS: { key: keyof PrayerSchedule; label: string }[] = [
  { key: "subuh", label: "Subuh" },
  { key: "dzuhur", label: "Dzuhur" },
  { key: "ashar", label: "Ashar" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isya", label: "Isya" },
];

export function Popup() {
  const clock = useLiveClock();
  const { data: config } = useTauriCommand<AppConfig>("get_config");

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{clock}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {config?.city_name ?? "Loading..."} · {config?.timezone ?? ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PRAYERS.map((p) => (
          <PrayerRow key={p.key} label={p.label} time="--:--" />
        ))}
      </div>
    </div>
  );
}

function PrayerRow({ label, time }: { label: string; time: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 8px",
        background: "rgba(0,0,0,0.04)",
        borderRadius: 6,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
    </div>
  );
}
```

- [ ] **Step 4: Wire Popup into App**

Replace `src/App.tsx`:

```typescript
import { Popup } from "./components/Popup";

function App() {
  return <Popup />;
}

export default App;
```

- [ ] **Step 5: Verify dev build**

```bash
cargo tauri dev
```

Expected: popup window shows live clock (updating every second) and city name from config.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add React popup with live clock and prayer schedule"
```

---

## Task 14: Onboarding Wizard (M5)

**Files:**
- Create: `src/components/Onboarding.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the Onboarding component**

Create `src/components/Onboarding.tsx`:

```typescript
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  last_lat_long: [number, number] | null;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

interface City {
  id: string;
  lokasi: string;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [locationMode, setLocationMode] = useState<"Auto" | "ManualCity">("Auto");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);

  const searchCities = async (q: string) => {
    setCityQuery(q);
    if (q.length < 2) {
      setCityResults([]);
      return;
    }
    // NOTE: requires a Tauri command `search_cities` (added in Task 12 extension)
    // For now this calls a command we'll register
    try {
      const results = await invoke<City[]>("search_cities", { query: q });
      setCityResults(results.slice(0, 10));
    } catch {
      setCityResults([]);
    }
  };

  const testSound = async () => {
    await invoke("test_sound");
  };

  const finish = async () => {
    const cfg: AppConfig = {
      onboarding_done: true,
      location_mode: locationMode,
      city_id: selectedCity?.id ?? "eda80a3d5b344bc40f3bc04f65b7a357",
      city_name: selectedCity?.lokasi ?? "JAKARTA",
      timezone: "Asia/Jakarta", // will be corrected by location service
      last_lat_long: null,
      volume: volume / 100,
      muted,
      reminder_offset_minutes: -5,
      auto_launch: true,
    };
    await invoke("complete_onboarding", { config: cfg });
    onDone();
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", height: "100%" }}>
      {step === 0 && (
        <div>
          <h2>🕌 Sholat Widget</h2>
          <p>Anda akan diberi tahu 5 menit sebelum setiap sholat.</p>
          <button onClick={() => setStep(1)}>Lanjut</button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h3>Pilih Lokasi</h3>
          <label>
            <input
              type="radio"
              checked={locationMode === "Auto"}
              onChange={() => setLocationMode("Auto")}
            />
            Deteksi otomatis (GPS/IP)
          </label>
          <br />
          <label>
            <input
              type="radio"
              checked={locationMode === "ManualCity"}
              onChange={() => setLocationMode("ManualCity")}
            />
            Pilih kota manual
          </label>

          {locationMode === "ManualCity" && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                placeholder="Cari kota..."
                value={cityQuery}
                onChange={(e) => searchCities(e.target.value)}
                style={{ width: "100%", padding: 6 }}
              />
              <div style={{ maxHeight: 120, overflowY: "auto" }}>
                {cityResults.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCity(c)}
                    style={{
                      padding: 6,
                      cursor: "pointer",
                      background:
                        selectedCity?.id === c.id ? "#d0d0ff" : "transparent",
                    }}
                  >
                    {c.lokasi}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setStep(2)}>Lanjut</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3>Atur Volume</h3>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <span>{volume}%</span>
          <br />
          <button onClick={testSound}>▶ Test Bunyi</button>
          <label>
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) => setMuted(e.target.checked)}
            />
            Mute
          </label>
          <br />
          <button onClick={() => setStep(3)}>Lanjut</button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>Selesai!</h3>
          <p>Pengingat aktif. Anda akan diberi tahu 5 menit sebelum sholat.</p>
          <button onClick={finish}>Mulai</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `search_cities` Tauri command**

In `src-tauri/src/main.rs`, add to the command section and registration:

```rust
#[tauri::command]
async fn search_cities(query: String) -> Result<Vec<models::City>, String> {
    let api = api::ApiClient::new();
    api.search_cities(&query).await.map_err(|e| e.to_string())
}
```

Add `search_cities` to the `invoke_handler!` list.

- [ ] **Step 3: Wire onboarding gate into App**

Replace `src/App.tsx`:

```typescript
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Popup } from "./components/Popup";
import { Onboarding } from "./components/Onboarding";

interface AppConfig {
  onboarding_done: boolean;
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // Check onboarding status on mount
  useState(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setOnboardingDone(cfg.onboarding_done))
      .catch(() => setOnboardingDone(false));
  });

  if (onboardingDone === null) {
    return <div>Loading...</div>;
  }
  if (!onboardingDone) {
    return <Onboarding onDone={() => setOnboardingDone(true)} />;
  }
  return <Popup />;
}

export default App;
```

- [ ] **Step 4: Verify dev build**

```bash
cargo tauri dev
```

Expected: Onboarding wizard appears first-run. Completing it shows the Popup.

- [ ] **Step 5: Commit**

```bash
git add src/ src-tauri/src/main.rs
git commit -m "feat: add 4-step onboarding wizard with location and volume setup"
```

---

## Task 15: Settings Panel + Location Picker (M5)

**Files:**
- Create: `src/components/Settings.tsx`
- Create: `src/components/LocationPicker.tsx`
- Modify: `src/components/Popup.tsx` (add settings button)

- [ ] **Step 1: Create LocationPicker**

Create `src/components/LocationPicker.tsx`:

```typescript
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface City {
  id: string;
  lokasi: string;
}

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

export function LocationPicker({
  config,
  onSaved,
}: {
  config: AppConfig;
  onSaved: (cfg: AppConfig) => void;
}) {
  const [mode, setMode] = useState<"Auto" | "ManualCity">(config.location_mode);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [selected, setSelected] = useState<City | null>({
    id: config.city_id,
    lokasi: config.city_name,
  });

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) return setResults([]);
    try {
      const r = await invoke<City[]>("search_cities", { query: q });
      setResults(r.slice(0, 10));
    } catch {
      setResults([]);
    }
  };

  const save = async () => {
    const updated: AppConfig = {
      ...config,
      location_mode: mode,
      city_id: selected?.id ?? config.city_id,
      city_name: selected?.lokasi ?? config.city_name,
    };
    await invoke("save_settings", { config: updated });
    onSaved(updated);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label>
        <input
          type="radio"
          checked={mode === "Auto"}
          onChange={() => setMode("Auto")}
        />
        Auto (GPS/IP)
      </label>
      <label style={{ marginLeft: 12 }}>
        <input
          type="radio"
          checked={mode === "ManualCity"}
          onChange={() => setMode("ManualCity")}
        />
        Manual
      </label>

      {mode === "ManualCity" && (
        <div style={{ marginTop: 8 }}>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Cari kota..."
            style={{ width: "100%", padding: 4 }}
          />
          {results.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              style={{
                padding: 4,
                cursor: "pointer",
                background: selected?.id === c.id ? "#ddd" : "transparent",
              }}
            >
              {c.lokasi}
            </div>
          ))}
        </div>
      )}
      <button onClick={save} style={{ marginTop: 8 }}>
        Simpan Lokasi
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create Settings panel**

Create `src/components/Settings.tsx`:

```typescript
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LocationPicker } from "./LocationPicker";

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

export function Settings({
  config,
  onClose,
}: {
  config: AppConfig;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<AppConfig>(config);

  const updateVolume = async (v: number) => {
    const updated = { ...cfg, volume: v };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  const toggleMute = async () => {
    const updated = { ...cfg, muted: !cfg.muted };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  const toggleAutoLaunch = async () => {
    const updated = { ...cfg, auto_launch: !cfg.auto_launch };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h3>⚙️ Settings</h3>

      <LocationPicker config={cfg} onSaved={setCfg} />

      <div style={{ marginBottom: 16 }}>
        <label>Volume: {Math.round(cfg.volume * 100)}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={cfg.volume * 100}
          onChange={(e) => updateVolume(Number(e.target.value) / 100)}
          style={{ width: "100%" }}
        />
        <label>
          <input type="checkbox" checked={cfg.muted} onChange={toggleMute} />
          Mute
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={cfg.auto_launch}
            onChange={toggleAutoLaunch}
          />
          Mulai saat komputer dinyalakan
        </label>
      </div>

      <button onClick={onClose}>Tutup</button>
    </div>
  );
}
```

- [ ] **Step 3: Add settings toggle to Popup**

In `src/components/Popup.tsx`, add a settings button and state:

```typescript
// Add import at top
import { Settings } from "./Settings";

// Inside Popup component, add state + conditional render:
export function Popup() {
  const clock = useLiveClock();
  const { data: config } = useTauriCommand<AppConfig>("get_config");
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings && config) {
    return <Settings config={config} onClose={() => setShowSettings(false)} />;
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      {/* ... existing clock + prayers ... */}
      <button onClick={() => setShowSettings(true)} style={{ marginTop: 12 }}>
        ⚙️ Settings
      </button>
    </div>
  );
}
```

Add `useState` to the imports in `Popup.tsx`:

```typescript
import { useState } from "react";
```

- [ ] **Step 4: Verify dev build**

```bash
cargo tauri dev
```

Expected: Popup has a Settings button. Clicking it opens the settings panel with volume slider, mute, location picker, and auto-launch toggle.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat: add settings panel with volume, mute, location, autolaunch"
```

---

## Task 16: Qibla Compass UI (M6)

**Files:**
- Create: `src/components/QiblaCompass.tsx`
- Modify: `src/components/Popup.tsx`

- [ ] **Step 1: Create QiblaCompass component**

Create `src/components/QiblaCompass.tsx`:

```typescript
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  last_lat_long: [number, number] | null;
}

export function QiblaCompass({ config }: { config: AppConfig }) {
  const [bearing, setBearing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    const coords = config.last_lat_long;
    if (!coords) {
      setError("Lokasi (koordinat) tidak tersedia. Gunakan deteksi auto.");
      return;
    }
    const [lat, lon] = coords;
    try {
      const b = await invoke<number>("get_qibla_bearing", { lat, lon });
      setBearing(b);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      <h4>🧭 Arah Kiblat</h4>
      <button onClick={calculate}>Hitung Arah Kiblat</button>
      {bearing !== null && (
        <div>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(bearing)}°
          </p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            dari Utara (menghadap {bearingLabel(bearing)})
          </p>
          {/* Static visual indicator */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "2px solid #888",
              margin: "8px auto",
              position: "relative",
              transform: `rotate(${bearing}deg)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: "50%",
                width: 2,
                height: 36,
                background: "red",
                transform: "translateX(-50%)",
              }}
            />
          </div>
          <p style={{ fontSize: 11, opacity: 0.6 }}>
            Sensor kompas tidak terdeteksi. Menampilkan bearing absolut.
          </p>
        </div>
      )}
      {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
    </div>
  );
}

function bearingLabel(b: number): string {
  if (b >= 337.5 || b < 22.5) return "Utara";
  if (b < 67.5) return "Timur Laut";
  if (b < 112.5) return "Timur";
  if (b < 157.5) return "Tenggara";
  if (b < 202.5) return "Selatan";
  if (b < 247.5) return "Barat Daya";
  if (b < 292.5) return "Barat";
  return "Barat Laut";
}
```

- [ ] **Step 2: Add Qibla to Popup**

In `src/components/Popup.tsx`, add the QiblaCompass below the prayer list (before the settings button):

```typescript
// Add import
import { QiblaCompass } from "./QiblaCompass";

// In the JSX, after prayer rows and before settings button:
{config && <QiblaCompass config={config} />}
```

- [ ] **Step 3: Verify dev build**

```bash
cargo tauri dev
```

Expected: Popup shows a Qibla section. Clicking "Hitung Arah Kiblat" shows the bearing (if coordinates available).

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: add qibla compass UI with bearing display"
```

---

## Task 17: Reminder Popup Event + Bedug Asset (M3: Integration)

**Files:**
- Modify: `src/App.tsx` (listen for reminder event)
- Modify: `src/components/Popup.tsx` (reminder banner)
- Add: `src-tauri/assets/sounds/azan.mp3` (user-provided)

- [ ] **Step 1: Add the real azan sound file**

Replace the placeholder with the actual azan audio provided by the user:

```bash
# User provides azan.mp3 — copy it to assets
cp /path/to/user-provided-azan.mp3 src-tauri/assets/sounds/azan.mp3
```

If the user has not provided it yet, keep the placeholder and note it as a manual step before release.

- [ ] **Step 2: Listen for prayer-reminder event in App**

In `src/App.tsx`, add event listening:

```typescript
import { listen } from "@tauri-apps/api/event";

function App() {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);

  useState(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setOnboardingDone(cfg.onboarding_done))
      .catch(() => setOnboardingDone(false));

    // Listen for reminder events from scheduler
    listen<string>("prayer-reminder", (event) => {
      setReminder(event.payload);
      // Auto-clear after 60 seconds
      setTimeout(() => setReminder(null), 60000);
    });
  });

  // ... rest of render logic

  // Show reminder banner overlay
  return (
    <>
      {/* normal content */}
      {reminder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#1a7f37",
            color: "white",
            padding: 12,
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          🕌 Waktu {reminder} segera — dalam 5 menit!
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify reminder triggers (manual test)**

To test without waiting for real prayer time, temporarily lower the offset in config to trigger soon, or set a test prayer time. Verify:
- Bedug sound plays
- Green banner appears at top of popup
- Banner auto-dismisses after 60s

- [ ] **Step 4: Commit**

```bash
git add src/ src-tauri/assets/sounds/azan.mp3
git commit -m "feat: wire prayer-reminder event to popup banner and azan audio"
```

---

## Task 18: Logging (M7: Polish)

**Files:**
- Create: `src-tauri/src/logging.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Create simple file logger**

Create `src-tauri/src/logging.rs`:

```rust
use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Logger {
    log_dir: PathBuf,
    _lock: Mutex<()>,
}

impl Logger {
    pub fn new() -> Self {
        let log_dir = crate::config::config_dir().join("logs");
        let _ = fs::create_dir_all(&log_dir);
        Logger {
            log_dir,
            _lock: Mutex::new(()),
        }
    }

    fn log_path(&self) -> PathBuf {
        let today = Local::now().format("%Y-%m-%d").to_string();
        self.log_dir.join(format!("app-{}.log", today))
    }

    pub fn log(&self, level: &str, msg: &str) {
        let _guard = self._lock.lock().unwrap();
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let line = format!("[{}] {} {}\n", timestamp, level, msg);
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.log_path())
        {
            let _ = file.write_all(line.as_bytes());
        }
        if level == "ERROR" {
            eprint!("{}", line);
        }
    }

    pub fn info(&self, msg: &str) {
        self.log("INFO", msg);
    }

    pub fn warn(&self, msg: &str) {
        self.log("WARN", msg);
    }

    pub fn error(&self, msg: &str) {
        self.log("ERROR", msg);
    }

    /// Delete log files older than 7 days.
    pub fn cleanup_old_logs(&self) {
        if let Ok(entries) = fs::read_dir(&self.log_dir) {
            let cutoff = Local::now()
                .checked_sub_days(chrono::Duration::days(7))
                .unwrap_or_else(Local::now);
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        let modified_dt: chrono::DateTime<Local> = modified.into();
                        if modified_dt < cutoff {
                            let _ = fs::remove_file(entry.path());
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Register module and initialize in main**

Add to `src-tauri/src/main.rs` top:

```rust
mod logging;
```

In the `setup` closure, add at the top:

```rust
let logger = std::sync::Arc::new(logging::Logger::new());
logger.cleanup_old_logs();
logger.info("Sholat Widget starting up");
```

- [ ] **Step 3: Run tests and verify build**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/logging.rs src-tauri/src/main.rs
git commit -m "feat: add file logger with daily rotation and 7-day retention"
```

---

## Task 19: Manual Test & Build Release (M7: Polish & Test)

**Files:** none (testing + build only)

- [ ] **Step 1: Run full test suite**

```bash
cd src-tauri && cargo test
```

Expected: all unit + contract tests pass.

- [ ] **Step 2: Manual test checklist — macOS**

Run `cargo tauri dev` and verify each item:

```
□ Tray icon mesjid appears in menu bar
□ Click tray → popup window shows
□ Popup shows live clock (updates each second)
□ Popup shows city name + timezone
□ Onboarding 4-step works on first run (delete config to test)
□ Auto-detect location: correct city
□ Manual city select: search "kediri" → results appear
□ Volume slider changes azan loudness
□ Mute toggle silences test sound
□ Settings saved across restart (delete config, re-run)
□ Auto-launch enabled in login items
□ Qibla: bearing shows correct degrees (~295° for Indonesia)
□ Bedug sound plays (verify file exists)
□ Disconnect internet → popup still shows cached schedule
```

- [ ] **Step 3: Manual test checklist — Windows**

Build on/for Windows and verify the same checklist. Note Windows-specific:
- Tray icon in system tray (bottom-right)
- Config path: `%APPDATA%/sholat-widget/`
- WebView2 must be installed (Tauri installer handles this)

- [ ] **Step 4: Build release binaries**

For macOS:
```bash
cargo tauri build
```
Output: `src-tauri/target/release/bundle/` with `.app` and `.dmg`.

For Windows (cross-compile or build natively on Windows):
```bash
cargo tauri build --target x86_64-pc-windows-msvc
```

- [ ] **Step 5: Commit final state and tag**

```bash
git add -A
git commit -m "chore: MVP complete - tested on macOS and Windows"
git tag v0.1.0-mvp
```

---

## Dependency Graph (suggested execution order)

```
Task 1 (scaffold)
  ├─► Task 2 (models)
  │     ├─► Task 4 (API client + fixtures)
  │     │     ├─► Task 6 (location service)
  │     │     └─► Task 5 (city service) ── depends on models only
  │     ├─► Task 3 (config)
  │     │     └─► Task 8 (cache)
  │     └─► Task 7 (time service)
  ├─► Task 9 (audio)
  ├─► Task 11 (qibla calc)
  ├─► Task 10 (scheduler) ── depends on time, audio, cache, models
  ├─► Task 12 (Tauri integration) ── depends on all Rust modules
  │     ├─► Task 13 (Popup + hooks)
  │     │     ├─► Task 14 (Onboarding)
  │     │     ├─► Task 15 (Settings)
  │     │     └─► Task 16 (Qibla UI)
  │     ├─► Task 17 (reminder event + azan)
  │     └─► Task 18 (logging)
  └─► Task 19 (test + release)
```

Tasks 2, 3, 9, 11 can be done in parallel after Task 1.
