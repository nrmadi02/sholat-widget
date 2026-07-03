use crate::models::*;
use std::time::Duration;

const MYQURAN_BASE: &str = "https://api.myquran.com/v3";
const IP_API_BASE: &str = "http://ip-api.com/json";

pub struct ApiClient {
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client");
        ApiClient { client }
    }

    /// GET /tools/ip — returns the caller's public IP.
    pub async fn get_ip(&self) -> Result<String, reqwest::Error> {
        let resp: IpResponse = self
            .client
            .get(format!("{}/tools/ip", MYQURAN_BASE))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data.ip)
    }

    /// GET ip-api.com/json/{ip} — geolocate IP to coordinates + timezone.
    pub async fn geolocate_ip(&self, ip: &str) -> Result<GeoLocation, reqwest::Error> {
        let url = format!("{}/{}?fields=status,city,lat,lon,timezone", IP_API_BASE, ip);
        let resp: GeoLocation = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }

    /// GET /sholat/kabkota/semua — full city list.
    pub async fn get_all_cities(&self) -> Result<Vec<City>, reqwest::Error> {
        let resp: CitiesResponse = self
            .client
            .get(format!("{}/sholat/kabkota/semua", MYQURAN_BASE))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data)
    }

    /// GET /sholat/kabkota/cari/{query} — search cities by name.
    pub async fn search_cities(&self, query: &str) -> Result<Vec<City>, reqwest::Error> {
        let resp: CitiesResponse = self
            .client
            .get(format!("{}/sholat/kabkota/cari/{}", MYQURAN_BASE, query))
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data)
    }

    /// GET /sholat/jadwal/{kotaId}/today?tz={tz} — today's prayer schedule.
    pub async fn get_today_schedule(
        &self,
        city_id: &str,
        tz: &str,
    ) -> Result<JadwalResponse, reqwest::Error> {
        let url = format!(
            "{}/sholat/jadwal/{}/today?tz={}",
            MYQURAN_BASE, city_id, tz
        );
        let resp: JadwalResponse = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }

    /// GET /sholat/jadwal/{kotaId}/{date} — schedule for a specific date.
    pub async fn get_schedule_for_date(
        &self,
        city_id: &str,
        date: &str,
    ) -> Result<JadwalResponse, reqwest::Error> {
        let url = format!("{}/sholat/jadwal/{}/{}", MYQURAN_BASE, city_id, date);
        let resp: JadwalResponse = self.client.get(url).send().await?.json().await?;
        Ok(resp)
    }
}