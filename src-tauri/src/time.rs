use chrono::{DateTime, Datelike, TimeZone, Utc};
use chrono_tz::Tz;
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub struct TimeService {
    ntp_utc: Arc<Mutex<Option<DateTime<Utc>>>>,
    last_sync: Arc<Mutex<Option<Instant>>>,
    offset_drift: Arc<Mutex<chrono::Duration>>,
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

    pub async fn sync_ntp(&self) -> Result<(), String> {
        let result = rsntp::AsyncSntpClient::new()
            .synchronize("pool.ntp.org")
            .await
            .map_err(|e| format!("NTP query failed: {}", e))?;

        let ntp_time: DateTime<Utc> = result
            .datetime()
            .into_chrono_datetime()
            .map_err(|e| format!("NTP datetime conversion: {}", e))?;
        let os_time = Utc::now();
        let drift = ntp_time - os_time;

        *self.ntp_utc.lock().unwrap() = Some(ntp_time);
        *self.offset_drift.lock().unwrap() = drift;
        *self.last_sync.lock().unwrap() = Some(Instant::now());
        Ok(())
    }

    // pub fn is_synced(&self) -> bool {
    //     if let Some(last) = *self.last_sync.lock().unwrap() {
    //         last.elapsed() < Duration::from_secs(86400)
    //     } else {
    //         false
    //     }
    // }

    pub fn now_local(&self) -> DateTime<Tz> {
        let os_utc = Utc::now();
        let corrected_utc = os_utc + *self.offset_drift.lock().unwrap();
        let tz = *self.timezone.lock().unwrap();
        corrected_utc.with_timezone(&tz)
    }

    // pub fn is_unverified(&self) -> bool {
    //     !self.is_synced()
    // }
}

#[cfg(test)]
pub fn parse_time(s: &str) -> Option<chrono::NaiveTime> {
    chrono::NaiveTime::parse_from_str(s, "%H:%M").ok()
}

pub fn is_in_reminder_window(
    now: DateTime<Tz>,
    prayer_hour: u32,
    prayer_min: u32,
    offset_minutes: i32,
) -> bool {
    let prayer = now
        .timezone()
        .with_ymd_and_hms(
            now.year(),
            now.month(),
            now.day(),
            prayer_hour,
            prayer_min,
            0,
        )
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
    use chrono::Timelike;

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
        let now = tz
            .with_ymd_and_hms(2026, 6, 23, 12, 10, 0)
            .single()
            .unwrap();
        assert!(is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_is_in_reminder_window_false_before() {
        let tz: Tz = "Asia/Jakarta".parse().unwrap();
        let now = tz.with_ymd_and_hms(2026, 6, 23, 12, 9, 0).single().unwrap();
        assert!(!is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_is_in_reminder_window_false_after() {
        let tz: Tz = "Asia/Jakarta".parse().unwrap();
        let now = tz
            .with_ymd_and_hms(2026, 6, 23, 12, 16, 0)
            .single()
            .unwrap();
        assert!(!is_in_reminder_window(now, 12, 15, -5));
    }

    #[test]
    fn test_timeservice_new_default_tz() {
        let ts = TimeService::new("Asia/Jakarta");
        let local = ts.now_local();
        assert_eq!(local.timezone().to_string(), "Asia/Jakarta");
    }
}
