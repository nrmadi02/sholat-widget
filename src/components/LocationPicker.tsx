import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types/config";

interface City {
  id: string;
  lokasi: string;
}

export function LocationPicker({
  config,
  onSaved,
  onError,
}: {
  config: AppConfig;
  onSaved: (cfg: AppConfig) => void;
  onError?: (msg: string | null) => void;
}) {
  const [mode, setMode] = useState<"Auto" | "ManualCity">(config.location_mode);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [selected, setSelected] = useState<City | null>({
    id: config.city_id,
    lokasi: config.city_name,
  });
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    onError?.(null);
    const updated: AppConfig = {
      ...config,
      location_mode: mode,
      city_id: selected?.id ?? config.city_id,
      city_name: selected?.lokasi ?? config.city_name,
    };
    try {
      const saved = await invoke<AppConfig>("save_settings", { config: updated });
      onSaved(saved);
    } catch (err) {
      onError?.(String(err));
    } finally {
      setSaving(false);
    }
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
      <button onClick={save} style={{ marginTop: 8 }} disabled={saving}>
        {saving ? "Menyimpan..." : "Simpan Lokasi"}
      </button>
    </div>
  );
}