import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  last_lat_long: [number, number] | null;
}

export function QiblaCompass({ config }: { config: AppConfig }) {
  const [bearing, setBearing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    const coords = config.last_lat_long;
    if (!coords) {
      setError("Lokasi (koordinat) tidak tersedia. Gunakan deteksi auto.");
      return;
    }
    const [lat, lon] = coords;
    try {
      const b = await invoke<number>("get_qibla_bearing", { lat, lon });
      setBearing(b);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      <h4>🧭 Arah Kiblat</h4>
      <button onClick={calculate}>Hitung Arah Kiblat</button>
      {bearing !== null && (
        <div>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {Math.round(bearing)}°
          </p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            dari Utara (menghadap {bearingLabel(bearing)})
          </p>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "2px solid #888",
              margin: "8px auto",
              position: "relative",
              transform: `rotate(${bearing}deg)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: "50%",
                width: 2,
                height: 36,
                background: "red",
                transform: "translateX(-50%)",
              }}
            />
          </div>
          <p style={{ fontSize: 11, opacity: 0.6 }}>
            Sensor kompas tidak terdeteksi. Menampilkan bearing absolut.
          </p>
        </div>
      )}
      {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
    </div>
  );
}

function bearingLabel(b: number): string {
  if (b >= 337.5 || b < 22.5) return "Utara";
  if (b < 67.5) return "Timur Laut";
  if (b < 112.5) return "Timur";
  if (b < 157.5) return "Tenggara";
  if (b < 202.5) return "Selatan";
  if (b < 247.5) return "Barat Daya";
  if (b < 292.5) return "Barat";
  return "Barat Laut";
}