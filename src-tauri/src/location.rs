use crate::api::ApiClient;
use crate::cache::CacheStore;
use crate::city::{cities_for_matching, match_city};
use crate::config::{load_config, save_config, Config, LocationMode};
use crate::models::*;
use std::error::Error;

/// Full auto-detect chain: IP → geolocate → search city → resolve.
pub async fn auto_detect(
    api: &ApiClient,
    cached_cities: &[City],
) -> Result<ResolvedLocation, Box<dyn Error + Send + Sync>> {
    let ip = api.get_ip().await?;
    let geo = api.geolocate_ip(&ip).await?;

    let city = if let Some(c) = match_city(&geo.city, cached_cities) {
        c.clone()
    } else {
        let results = api.search_cities(&geo.city).await?;
        match_city(&geo.city, &results)
            .cloned()
            .ok_or("could not match city from geolocation")?
    };

    Ok(ResolvedLocation {
        city_id: city.id,
        city_name: city.lokasi,
        prov: None,
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
        lat: 0.0,
        lon: 0.0,
    })
}

pub fn apply_to_config(cfg: &mut Config, loc: &ResolvedLocation) {
    cfg.city_id = loc.city_id.clone();
    cfg.city_name = loc.city_name.clone();
    cfg.timezone = loc.timezone.clone();
    if loc.lat != 0.0 || loc.lon != 0.0 {
        cfg.last_lat_long = Some((loc.lat, loc.lon));
    }
}

/// Resolve location from the current config mode and persist updates.
pub async fn sync_config_location() -> Result<(), String> {
    let mut cfg = load_config();
    let api = ApiClient::new();
    let cache = CacheStore::new();

    let resolved = match cfg.location_mode {
        LocationMode::Auto => {
            let cities = cities_for_matching(&cache);
            auto_detect(&api, &cities)
                .await
                .map_err(|e| e.to_string())?
        }
        LocationMode::ManualCity => {
            let city = City {
                id: cfg.city_id.clone(),
                lokasi: cfg.city_name.clone(),
            };
            resolve_manual(&api, &city)
                .await
                .map_err(|e| e.to_string())?
        }
    };

    apply_to_config(&mut cfg, &resolved);
    save_config(&cfg).map_err(|e| e.to_string())
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

    #[test]
    fn test_apply_to_config_sets_coords() {
        let loc = ResolvedLocation {
            city_id: "abc".into(),
            city_name: "JAKARTA".into(),
            prov: None,
            timezone: "Asia/Jakarta".into(),
            lat: -6.2,
            lon: 106.8,
        };
        let mut cfg = Config::default();
        apply_to_config(&mut cfg, &loc);
        assert_eq!(cfg.city_id, "abc");
        assert_eq!(cfg.last_lat_long, Some((-6.2, 106.8)));
    }

    #[test]
    fn test_apply_to_config_skips_zero_coords() {
        let loc = ResolvedLocation {
            city_id: "abc".into(),
            city_name: "KOTA KEDIRI".into(),
            prov: Some("JAWA TIMUR".into()),
            timezone: "Asia/Jakarta".into(),
            lat: 0.0,
            lon: 0.0,
        };
        let mut cfg = Config::default();
        apply_to_config(&mut cfg, &loc);
        assert!(cfg.last_lat_long.is_none());
    }
}
