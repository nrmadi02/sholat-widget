import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLiveClock, useTauriCommand } from "../hooks/useTauriCommand";
import { Settings } from "./Settings";
import { QiblaCompass } from "./QiblaCompass";

interface AppConfig {
  onboarding_done: boolean;
  location_mode: "Auto" | "ManualCity";
  city_id: string;
  city_name: string;
  timezone: string;
  last_lat_long: [number, number] | null;
  volume: number;
  muted: boolean;
  reminder_offset_minutes: number;
  auto_launch: boolean;
}

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

const PRAYERS: { key: keyof PrayerSchedule; label: string }[] = [
  { key: "subuh", label: "Subuh" },
  { key: "dzuhur", label: "Dzuhur" },
  { key: "ashar", label: "Ashar" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isya", label: "Isya" },
];

export function Popup() {
  const clock = useLiveClock();
  const { data: config } = useTauriCommand<AppConfig>("get_config");
  const [showSettings, setShowSettings] = useState(false);
  const [schedule, setSchedule] = useState<PrayerSchedule | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      invoke<PrayerSchedule | null>("get_today_schedule")
        .then((entry) => {
          if (!cancelled) {
            setSchedule(entry);
            setScheduleError(entry ? null : "Jadwal belum tersedia");
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setScheduleError(String(err));
          }
        });
    };

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config?.city_id]);

  if (showSettings && config) {
    return <Settings config={config} onClose={() => setShowSettings(false)} />;
  }

  const next = schedule ? findNextPrayer(schedule, clock) : null;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{clock}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {config?.city_name ?? "Loading..."} · {config?.timezone ?? ""}
        </div>
        {next && (
          <div style={{ fontSize: 13, marginTop: 6, color: "#1a7f37", fontWeight: 600 }}>
            {next.label} dalam {formatCountdown(next.minutes)}
          </div>
        )}
        {scheduleError && !schedule && (
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>{scheduleError}</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {schedule && (
          <PrayerRow label="Imsak" time={schedule.imsak} highlight={false} />
        )}
        {PRAYERS.map((p) => (
          <PrayerRow
            key={p.key}
            label={p.label}
            time={schedule?.[p.key] ?? "--:--"}
            highlight={next?.label === p.label}
          />
        ))}
      </div>
      {config && <QiblaCompass config={config} />}
      <button onClick={() => setShowSettings(true)} style={{ marginTop: 12 }}>
        ⚙️ Settings
      </button>
    </div>
  );
}

function minutesUntil(time: string, nowHms: string): number {
  const [nh, nm] = nowHms.split(":").map(Number);
  const [th, tm] = time.split(":").map(Number);
  return th * 60 + tm - (nh * 60 + nm);
}

function findNextPrayer(
  schedule: PrayerSchedule,
  clock: string
): { label: string; time: string; minutes: number } | null {
  for (const p of PRAYERS) {
    const diff = minutesUntil(schedule[p.key], clock);
    if (diff > 0) {
      return { label: p.label, time: schedule[p.key], minutes: diff };
    }
  }
  const untilSubuh = minutesUntil(schedule.subuh, clock) + 24 * 60;
  return { label: PRAYERS[0].label, time: schedule.subuh, minutes: untilSubuh };
}

function formatCountdown(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function PrayerRow({
  label,
  time,
  highlight,
}: {
  label: string;
  time: string;
  highlight: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 8px",
        background: highlight ? "rgba(26, 127, 55, 0.12)" : "rgba(0,0,0,0.04)",
        borderRadius: 6,
        fontWeight: highlight ? 600 : 400,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
    </div>
  );
}