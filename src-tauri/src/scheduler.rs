use crate::audio::AudioPlayer;
use crate::cache::CacheStore;
use crate::config::load_config;
use crate::models::{JadwalEntry, PrayerKind};
use crate::time::{is_in_reminder_window, TimeService};
use chrono::NaiveDate;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

pub fn extract_prayers(entry: &JadwalEntry) -> Vec<(PrayerKind, &str)> {
    vec![
        (PrayerKind::Subuh, entry.subuh.as_str()),
        (PrayerKind::Dzuhur, entry.dzuhur.as_str()),
        (PrayerKind::Ashar, entry.ashar.as_str()),
        (PrayerKind::Maghrib, entry.maghrib.as_str()),
        (PrayerKind::Isya, entry.isya.as_str()),
    ]
}

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

pub async fn run_scheduler(
    time_service: Arc<TimeService>,
    cache: Arc<CacheStore>,
    on_remind: Arc<dyn Fn(PrayerKind) + Send + Sync>,
) {
    let audio = AudioPlayer::new();
    let mut last_date: Option<NaiveDate> = None;

    loop {
        let now = time_service.now_local();
        let today = now.date_naive();

        if last_date != Some(today) {
            let _ = cache.cleanup_old_flags();
            last_date = Some(today);
        }

        if let Some(entry) = cache.get_today_schedule() {
            let cfg = load_config();
            let offset = cfg.reminder_offset_minutes;

            for (kind, time_str) in extract_prayers(&entry) {
                if let Some((h, m)) = parse_hhmm(time_str) {
                    let already = cache.is_reminded(today, kind);
                    let in_window = is_in_reminder_window(now, h, m, offset);

                    if in_window && !already {
                        let _ = audio.play_bedug();
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