import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LocationPicker } from "./LocationPicker";

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

export function Settings({
  config,
  onClose,
}: {
  config: AppConfig;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<AppConfig>(config);

  const updateVolume = async (v: number) => {
    const updated = { ...cfg, volume: v };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  const toggleMute = async () => {
    const updated = { ...cfg, muted: !cfg.muted };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  const toggleAutoLaunch = async () => {
    const updated = { ...cfg, auto_launch: !cfg.auto_launch };
    setCfg(updated);
    await invoke("save_settings", { config: updated });
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h3>⚙️ Settings</h3>

      <LocationPicker config={cfg} onSaved={setCfg} />

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

      <button onClick={onClose}>Tutup</button>
    </div>
  );
}