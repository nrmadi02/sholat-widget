import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types/config";

interface City {
  id: string;
  lokasi: string;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [locationMode, setLocationMode] = useState<"Auto" | "ManualCity">("Auto");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);

  const searchCities = async (q: string) => {
    setCityQuery(q);
    if (q.length < 2) {
      setCityResults([]);
      return;
    }
    try {
      const results = await invoke<City[]>("search_cities", { query: q });
      setCityResults(results.slice(0, 10));
    } catch {
      setCityResults([]);
    }
  };

  const testSound = async () => {
    await invoke("test_sound");
  };

  const finish = async () => {
    const cfg: AppConfig = {
      onboarding_done: true,
      location_mode: locationMode,
      city_id: selectedCity?.id ?? "eda80a3d5b344bc40f3bc04f65b7a357",
      city_name: selectedCity?.lokasi ?? "JAKARTA",
      timezone: "Asia/Jakarta",
      last_lat_long: null,
      volume: volume / 100,
      muted,
      reminder_offset_minutes: -5,
      auto_launch: true,
    };
    await invoke("complete_onboarding", { config: cfg });
    onDone();
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", height: "100%" }}>
      {step === 0 && (
        <div>
          <h2>🕌 Sholat Widget</h2>
          <p>Anda akan diberi tahu 5 menit sebelum setiap sholat.</p>
          <button onClick={() => setStep(1)}>Lanjut</button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h3>Pilih Lokasi</h3>
          <label>
            <input
              type="radio"
              checked={locationMode === "Auto"}
              onChange={() => setLocationMode("Auto")}
            />
            Deteksi otomatis (GPS/IP)
          </label>
          <br />
          <label>
            <input
              type="radio"
              checked={locationMode === "ManualCity"}
              onChange={() => setLocationMode("ManualCity")}
            />
            Pilih kota manual
          </label>

          {locationMode === "ManualCity" && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                placeholder="Cari kota..."
                value={cityQuery}
                onChange={(e) => searchCities(e.target.value)}
                style={{ width: "100%", padding: 6 }}
              />
              <div style={{ maxHeight: 120, overflowY: "auto" }}>
                {cityResults.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCity(c)}
                    style={{
                      padding: 6,
                      cursor: "pointer",
                      background:
                        selectedCity?.id === c.id ? "#d0d0ff" : "transparent",
                    }}
                  >
                    {c.lokasi}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setStep(2)}>Lanjut</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3>Atur Volume</h3>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <span>{volume}%</span>
          <br />
          <button onClick={testSound}>▶ Test Bunyi</button>
          <label>
            <input
              type="checkbox"
              checked={muted}
              onChange={(e) => setMuted(e.target.checked)}
            />
            Mute
          </label>
          <br />
          <button onClick={() => setStep(3)}>Lanjut</button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>Selesai!</h3>
          <p>Pengingat aktif. Anda akan diberi tahu 5 menit sebelum sholat.</p>
          <button onClick={finish}>Mulai</button>
        </div>
      )}
    </div>
  );
}