use crate::cache::CacheStore;
use crate::models::City;

/// Embedded top cities used when the on-disk city cache is empty.
pub fn load_fallback_cities() -> Vec<City> {
    let json = include_str!("../assets/cities_fallback.json");
    serde_json::from_str(json).unwrap_or_default()
}

/// Prefer cached cities; fall back to the bundled list for auto-detect matching.
pub fn cities_for_matching(cache: &CacheStore) -> Vec<City> {
    let cached = cache.load_cities();
    if cached.is_empty() {
        load_fallback_cities()
    } else {
        cached
    }
}

/// Normalize a city name for fuzzy comparison:
/// uppercase, trim, remove "KOTA "/"KAB. " prefix, collapse spaces.
pub fn normalize_city_name(name: &str) -> String {
    let upper = name.to_uppercase().trim().to_string();
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
    if let Some(c) = cities.iter().find(|c| normalize_city_name(&c.lokasi) == q) {
        return Some(c);
    }
    cities.iter().find(|c| {
        let n = normalize_city_name(&c.lokasi);
        n.contains(&q) || q.contains(&n)
    })
}

const WITA_PROVINCES: &[&str] = &[
    "BALI",
    "NUSA TENGGARA BARAT",
    "NUSA TENGGARA TIMUR",
    "SULAWESI UTARA",
    "SULAWESI TENGAH",
    "SULAWESI SELATAN",
    "SULAWESI TENGGARA",
    "SULAWESI BARAT",
    "GORONTALO",
    "KALIMANTAN TENGAH",
    "KALIMANTAN SELATAN",
    "KALIMANTAN TIMUR",
    "KALIMANTAN UTARA",
];

const WIT_PROVINCES: &[&str] = &[
    "MALUKU",
    "MALUKU UTARA",
    "PAPUA",
    "PAPUA BARAT",
    "PAPUA SELATAN",
    "PAPUA TENGAH",
    "PAPUA PEGUNUNGAN",
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
        "Asia/Jakarta"
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
            City {
                id: "1".into(),
                lokasi: "KOTA KEDIRI".into(),
            },
            City {
                id: "2".into(),
                lokasi: "KAB. KEDIRI".into(),
            },
        ];
        let m = match_city("Kediri", &cities);
        assert!(m.is_some());
        assert_eq!(m.unwrap().id, "1");
    }

    #[test]
    fn test_match_city_ip_api_variant() {
        let cities = vec![City {
            id: "1".into(),
            lokasi: "KOTA BANJARMASIN".into(),
        }];
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

    #[test]
    fn test_load_fallback_cities_not_empty() {
        let cities = load_fallback_cities();
        assert!(!cities.is_empty());
        assert!(!cities[0].id.is_empty());
    }
}
