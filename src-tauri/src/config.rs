use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Bump when onboarding flow changes enough to require users to run it again.
/// Patch releases (0.4.0 → 0.4.1) usually keep this unchanged.
pub const CURRENT_ONBOARDING_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LocationMode {
    Auto,
    ManualCity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub onboarding_done: bool,
    #[serde(default)]
    pub onboarding_schema_version: u32,
    pub location_mode: LocationMode,
    pub city_id: String,
    pub city_name: String,
    pub timezone: String,
    #[serde(default)]
    pub last_lat_long: Option<(f64, f64)>,
    pub volume: f32,
    pub muted: bool,
    #[serde(default)]
    pub notifications_enabled: bool,
    pub reminder_offset_minutes: i32,
    pub auto_launch: bool,
    #[serde(default)]
    pub last_update_check_at: Option<i64>,
    #[serde(default)]
    pub update_dismissed_version: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            onboarding_done: false,
            onboarding_schema_version: 0,
            location_mode: LocationMode::Auto,
            city_id: "eda80a3d5b344bc40f3bc04f65b7a357".to_string(),
            city_name: "JAKARTA".to_string(),
            timezone: "Asia/Jakarta".to_string(),
            last_lat_long: None,
            volume: 0.7,
            muted: false,
            notifications_enabled: false,
            reminder_offset_minutes: -1,
            auto_launch: true,
            last_update_check_at: None,
            update_dismissed_version: None,
        }
    }
}

/// Returns the config directory path, creating it if needed.
pub fn config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("sholat-widget");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn needs_onboarding_refresh(cfg: &Config) -> bool {
    cfg.onboarding_done && cfg.onboarding_schema_version < CURRENT_ONBOARDING_SCHEMA_VERSION
}

fn apply_onboarding_schema_migration(mut cfg: Config) -> Config {
    if needs_onboarding_refresh(&cfg) {
        cfg.onboarding_done = false;
        let _ = save_config(&cfg);
    }
    cfg
}

pub fn load_config() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Config>(&content) {
            Ok(cfg) => apply_onboarding_schema_migration(cfg),
            Err(_) => {
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
        assert_eq!(cfg.reminder_offset_minutes, -1);
        assert!(!cfg.notifications_enabled);
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

    #[test]
    fn test_needs_onboarding_refresh_when_schema_stale() {
        let cfg = Config {
            onboarding_done: true,
            onboarding_schema_version: 0,
            ..Config::default()
        };
        assert!(needs_onboarding_refresh(&cfg));
    }

    #[test]
    fn test_needs_onboarding_refresh_when_schema_current() {
        let cfg = Config {
            onboarding_done: true,
            onboarding_schema_version: CURRENT_ONBOARDING_SCHEMA_VERSION,
            ..Config::default()
        };
        assert!(!needs_onboarding_refresh(&cfg));
    }

    #[test]
    fn test_needs_onboarding_refresh_skips_incomplete_onboarding() {
        let cfg = Config {
            onboarding_done: false,
            onboarding_schema_version: 0,
            ..Config::default()
        };
        assert!(!needs_onboarding_refresh(&cfg));
    }

    #[test]
    fn test_deserialize_legacy_config_without_schema_version() {
        let json = r#"{
            "onboarding_done": true,
            "location_mode": "Auto",
            "city_id": "eda80a3d5b344bc40f3bc04f65b7a357",
            "city_name": "JAKARTA",
            "timezone": "Asia/Jakarta",
            "volume": 0.7,
            "muted": false,
            "reminder_offset_minutes": -1,
            "auto_launch": true
        }"#;
        let cfg: Config = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.onboarding_schema_version, 0);
        assert!(needs_onboarding_refresh(&cfg));
    }

    #[test]
    fn test_deserialize_frontend_payload_without_coords() {
        let json = r#"{
            "onboarding_done": true,
            "location_mode": "Auto",
            "city_id": "eda80a3d5b344bc40f3bc04f65b7a357",
            "city_name": "JAKARTA",
            "timezone": "Asia/Jakarta",
            "volume": 0.5,
            "muted": false,
            "notifications_enabled": true,
            "reminder_offset_minutes": -1,
            "auto_launch": true
        }"#;
        let cfg: Config = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.volume, 0.5);
        assert!(cfg.notifications_enabled);
        assert_eq!(cfg.reminder_offset_minutes, -1);
        assert!(cfg.last_lat_long.is_none());
    }
}
