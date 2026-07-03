use crate::models::{City, JadwalEntry, PrayerKind};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCache {
    pub schedules: HashMap<String, JadwalEntry>,
    pub city_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemindedFlags {
    pub reminded: HashSet<String>,
}

#[derive(Clone)]
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

    pub fn get_schedule_for_date(&self, date: &str) -> Option<JadwalEntry> {
        let cache = self.load_schedule()?;
        cache.schedules.get(date).cloned()
    }

    pub fn get_today_schedule(&self) -> Option<JadwalEntry> {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        self.get_schedule_for_date(&today)
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

    pub fn mark_reminded(&self, date: NaiveDate, kind: PrayerKind) -> std::io::Result<()> {
        let mut flags = self.load_reminded();
        let key = format!("{}:{}", date.format("%Y-%m-%d"), kind.label());
        flags.reminded.insert(key);
        self.save_reminded(&flags)
    }

    pub fn is_reminded(&self, date: NaiveDate, kind: PrayerKind) -> bool {
        let flags = self.load_reminded();
        let key = format!("{}:{}", date.format("%Y-%m-%d"), kind.label());
        flags.reminded.contains(&key)
    }

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
        set.insert("2026-06-23:Maghrib".into());
        assert_eq!(set.len(), 1);
    }
}