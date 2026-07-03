import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LocationPicker } from "./LocationPicker";
import type { AppConfig } from "../types/config";

export function Settings({
  config,
  onClose,
}: {
  config: AppConfig;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<AppConfig>(config);
  const [error, setError] = useState<string | null>(null);

  const persist = async (updated: AppConfig) => {
    try {
      const saved = await invoke<AppConfig>("save_settings", { config: updated });
      setCfg(saved);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const updateVolume = async (v: number) => {
    await persist({ ...cfg, volume: v });
  };

  const toggleMute = async () => {
    await persist({ ...cfg, muted: !cfg.muted });
  };

  const toggleAutoLaunch = async () => {
    await persist({ ...cfg, auto_launch: !cfg.auto_launch });
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h3>⚙️ Settings</h3>

      <LocationPicker config={cfg} onSaved={(saved) => setCfg(saved)} onError={setError} />

      <div style={{ marginBottom: 16 }}>
        <label>Volume: {Math.round(cfg.volume * 100)}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={cfg.volume * 100}
          onChange={(e) => updateVolume(Number(e.target.value) / 100)}
          style={{ width: "100%" }}
        />
        <label>
          <input type="checkbox" checked={cfg.muted} onChange={toggleMute} />
          Mute
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={cfg.auto_launch}
            onChange={toggleAutoLaunch}
          />
          Mulai saat komputer dinyalakan
        </label>
      </div>

      {error && (
        <p style={{ color: "#b42318", fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      <button onClick={onClose}>Tutup</button>
    </div>
  );
}