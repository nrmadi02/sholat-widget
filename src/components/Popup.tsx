import { useLiveClock, useTauriCommand } from "../hooks/useTauriCommand";

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

const PRAYERS: { key: keyof PrayerSchedule; label: string }[] = [
  { key: "subuh", label: "Subuh" },
  { key: "dzuhur", label: "Dzuhur" },
  { key: "ashar", label: "Ashar" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isya", label: "Isya" },
];

interface PrayerSchedule {
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
}

export function Popup() {
  const clock = useLiveClock();
  const { data: config } = useTauriCommand<AppConfig>("get_config");

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{clock}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {config?.city_name ?? "Loading..."} · {config?.timezone ?? ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PRAYERS.map((p) => (
          <PrayerRow key={p.key} label={p.label} time="--:--" />
        ))}
      </div>
    </div>
  );
}

function PrayerRow({ label, time }: { label: string; time: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 8px",
        background: "rgba(0,0,0,0.04)",
        borderRadius: 6,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
    </div>
  );
}