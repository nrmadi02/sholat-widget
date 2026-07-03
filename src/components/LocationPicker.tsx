import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface City {
  id: string;
  lokasi: string;
}

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

export function LocationPicker({
  config,
  onSaved,
}: {
  config: AppConfig;
  onSaved: (cfg: AppConfig) => void;
}) {
  const [mode, setMode] = useState<"Auto" | "ManualCity">(config.location_mode);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [selected, setSelected] = useState<City | null>({
    id: config.city_id,
    lokasi: config.city_name,
  });

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) return setResults([]);
    try {
      const r = await invoke<City[]>("search_cities", { query: q });
      setResults(r.slice(0, 10));
    } catch {
      setResults([]);
    }
  };

  const save = async () => {
    const updated: AppConfig = {
      ...config,
      location_mode: mode,
      city_id: selected?.id ?? config.city_id,
      city_name: selected?.lokasi ?? config.city_name,
    };
    await invoke("save_settings", { config: updated });
    onSaved(updated);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label>
        <input
          type="radio"
          checked={mode === "Auto"}
          onChange={() => setMode("Auto")}
        />
        Auto (GPS/IP)
      </label>
      <label style={{ marginLeft: 12 }}>
        <input
          type="radio"
          checked={mode === "ManualCity"}
          onChange={() => setMode("ManualCity")}
        />
        Manual
      </label>

      {mode === "ManualCity" && (
        <div style={{ marginTop: 8 }}>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Cari kota..."
            style={{ width: "100%", padding: 4 }}
          />
          {results.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              style={{
                padding: 4,
                cursor: "pointer",
                background: selected?.id === c.id ? "#ddd" : "transparent",
              }}
            >
              {c.lokasi}
            </div>
          ))}
        </div>
      )}
      <button onClick={save} style={{ marginTop: 8 }}>
        Simpan Lokasi
      </button>
    </div>
  );
}