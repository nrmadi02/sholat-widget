use crate::api::ApiClient;
use crate::city::match_city;
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