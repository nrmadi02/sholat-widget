use sholat_widget::models::*;

#[test]
fn test_jadwal_fixture_parses() {
    let json = include_str!("fixtures/jadwal_response.json");
    let resp: JadwalResponse = serde_json::from_str(json).expect("jadwal fixture should parse");
    assert!(resp.status);
    assert!(!resp.data.kabko.is_empty());
    assert!(!resp.data.jadwal.is_empty());
}

#[test]
fn test_kabkota_semua_fixture_parses() {
    let json = include_str!("fixtures/kabkota_semua.json");
    let resp: CitiesResponse =
        serde_json::from_str(json).expect("kabkota semua fixture should parse");
    assert!(resp.status);
    assert!(resp.data.len() > 100);
}

#[test]
fn test_kabkota_search_fixture_parses() {
    let json = include_str!("fixtures/kabkota_search.json");
    let resp: CitiesResponse =
        serde_json::from_str(json).expect("kabkota search fixture should parse");
    assert!(resp.data.iter().any(|c| c.lokasi.contains("KEDIRI")));
}
