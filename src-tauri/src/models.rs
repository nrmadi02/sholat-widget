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
        [
            PrayerKind::Subuh,
            PrayerKind::Dzuhur,
            PrayerKind::Ashar,
            PrayerKind::Maghrib,
            PrayerKind::Isya,
        ]
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
        assert!(PrayerTime::parse(PrayerKind::Subuh, "25:99").is_none() == false);
    }
}