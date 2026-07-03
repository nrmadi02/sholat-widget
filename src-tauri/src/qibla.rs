/// Kaaba coordinates (Mecca).
pub const KAABA_LAT: f64 = 21.4225;
pub const KAABA_LON: f64 = 39.8262;

/// Calculate the initial bearing (great-circle) from a point to the Kaaba.
pub fn qibla_bearing(lat: f64, lon: f64) -> f64 {
    let phi1 = lat.to_radians();
    let phi2 = KAABA_LAT.to_radians();
    let delta_lambda = (KAABA_LON - lon).to_radians();

    let y = delta_lambda.sin() * phi2.cos();
    let x = phi1.cos() * phi2.tan() - phi1.sin() * phi2.cos() * delta_lambda.cos();

    let theta = y.atan2(x);
    let bearing_deg = theta.to_degrees();
    (bearing_deg + 360.0) % 360.0
}

pub fn normalize_heading(h: f64) -> f64 {
    ((h % 360.0) + 360.0) % 360.0
}

pub fn relative_direction(current_heading: f64, qibla: f64) -> f64 {
    let diff = qibla - normalize_heading(current_heading);
    ((diff + 540.0) % 360.0) - 180.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qibla_bearing_from_jakarta() {
        let bearing = qibla_bearing(-6.2088, 106.8456);
        assert!(
            bearing > 290.0 && bearing < 300.0,
            "Jakarta qibla bearing should be ~295°, got {}",
            bearing
        );
    }

    #[test]
    fn test_qibla_bearing_from_banjarmasin() {
        let bearing = qibla_bearing(-3.3186, 114.5944);
        assert!(
            bearing > 290.0 && bearing < 300.0,
            "Banjarmasin qibla bearing should be ~295°, got {}",
            bearing
        );
    }

    #[test]
    fn test_qibla_bearing_from_mecca() {
        let bearing = qibla_bearing(KAABA_LAT, KAABA_LON);
        assert!(bearing >= 0.0 && bearing < 360.0);
    }

    #[test]
    fn test_normalize_heading() {
        assert_eq!(normalize_heading(370.0), 10.0);
        assert_eq!(normalize_heading(-10.0), 350.0);
        assert_eq!(normalize_heading(0.0), 0.0);
    }

    #[test]
    fn test_relative_direction() {
        let rel = relative_direction(0.0, 295.0);
        assert_eq!(rel, -65.0);
    }
}