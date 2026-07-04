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
    #[serde(default)]
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
            city_id: "eda80a3d5b344bc40f3bc04f65b7a357".to_string(),
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
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
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
            "reminder_offset_minutes": -5,
            "auto_launch": true
        }"#;
        let cfg: Config = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.volume, 0.5);
        assert!(cfg.last_lat_long.is_none());
    }
}
