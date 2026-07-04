use crate::api::ApiClient;
use crate::cache::{CacheStore, ScheduleCache};
use crate::city::prov_to_timezone;
use crate::config::{load_config, save_config};
use crate::models::JadwalEntry;
use std::collections::HashMap;

/// Returns true when today's schedule is missing or belongs to a different city.
pub fn needs_refresh(cache: &CacheStore, city_id: &str, today: &str) -> bool {
    match cache.load_schedule() {
        None => true,
        Some(c) => c.city_id != city_id || !c.schedules.contains_key(today),
    }
}

pub fn merge_jadwal(
    cache: &mut ScheduleCache,
    city_id: &str,
    entries: HashMap<String, JadwalEntry>,
) {
    if cache.city_id != city_id {
        cache.schedules.clear();
        cache.city_id = city_id.to_string();
    }
    cache.schedules.extend(entries);
}

/// Fetch today's schedule from API, prefetch tomorrow, and persist to cache.
pub async fn refresh_schedule(cache: &CacheStore) -> Result<(), String> {
    let cfg = load_config();
    refresh_schedule_for(cache, &cfg.city_id, &cfg.timezone).await
}

pub async fn refresh_schedule_for(
    cache: &CacheStore,
    city_id: &str,
    timezone: &str,
) -> Result<(), String> {
    let api = ApiClient::new();

    let today_resp = api
        .get_today_schedule(city_id, timezone)
        .await
        .map_err(|e| format!("fetch today schedule: {}", e))?;

    let mut schedule_cache = cache.load_schedule().unwrap_or(ScheduleCache {
        schedules: HashMap::new(),
        city_id: city_id.to_string(),
    });

    merge_jadwal(&mut schedule_cache, city_id, today_resp.data.jadwal);

    if let Some(prov) = &today_resp.data.prov {
        let tz = prov_to_timezone(prov);
        let mut cfg = load_config();
        if cfg.timezone != tz {
            cfg.timezone = tz.to_string();
            let _ = save_config(&cfg);
        }
    }

    let today = chrono::Local::now().date_naive();
    let tomorrow = today.succ_opt().unwrap_or(today);
    let tomorrow_str = tomorrow.format("%Y-%m-%d").to_string();

    if !schedule_cache.schedules.contains_key(&tomorrow_str) {
        if let Ok(tomorrow_resp) = api.get_schedule_for_date(city_id, &tomorrow_str).await {
            merge_jadwal(&mut schedule_cache, city_id, tomorrow_resp.data.jadwal);
        }
    }

    cache
        .save_schedule(&schedule_cache)
        .map_err(|e| format!("save schedule cache: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entry() -> JadwalEntry {
        JadwalEntry {
            tanggal: "Jumat, 03/07/2026".into(),
            imsak: "04:15".into(),
            subuh: "04:25".into(),
            terbit: "05:43".into(),
            dhuha: "06:12".into(),
            dzuhur: "11:40".into(),
            ashar: "14:59".into(),
            maghrib: "17:30".into(),
            isya: "18:44".into(),
        }
    }

    #[test]
    fn test_needs_refresh_logic() {
        let cache = ScheduleCache {
            schedules: HashMap::from([("2026-07-02".into(), sample_entry())]),
            city_id: "abc".into(),
        };
        assert!(!cache.schedules.contains_key("2026-07-03"));
        assert_eq!(cache.city_id, "abc");
    }

    #[test]
    fn test_merge_jadwal_clears_on_city_change() {
        let mut cache = ScheduleCache {
            schedules: HashMap::from([("2026-07-03".into(), sample_entry())]),
            city_id: "old".into(),
        };
        let mut new_entries = HashMap::new();
        new_entries.insert("2026-07-03".into(), sample_entry());
        merge_jadwal(&mut cache, "new", new_entries);
        assert_eq!(cache.city_id, "new");
        assert_eq!(cache.schedules.len(), 1);
    }

    #[test]
    fn test_merge_jadwal_keeps_existing_dates() {
        let mut cache = ScheduleCache {
            schedules: HashMap::from([("2026-07-03".into(), sample_entry())]),
            city_id: "abc".into(),
        };
        let mut extra = HashMap::new();
        extra.insert("2026-07-04".into(), sample_entry());
        merge_jadwal(&mut cache, "abc", extra);
        assert_eq!(cache.schedules.len(), 2);
    }
}
