import type { LucideIcon } from "lucide-react";
import {
  CloudSun,
  Moon,
  Sun,
  SunMedium,
  Sunrise,
  Sunset,
} from "lucide-react";

export interface PrayerSchedule {
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

export type PrayerKey = keyof Omit<PrayerSchedule, "tanggal">;

export const PRAYERS: { key: PrayerKey; label: string; icon: LucideIcon }[] = [
  { key: "subuh", label: "Subuh", icon: Sunrise },
  { key: "dzuhur", label: "Dzuhur", icon: Sun },
  { key: "ashar", label: "Ashar", icon: CloudSun },
  { key: "maghrib", label: "Maghrib", icon: Sunset },
  { key: "isya", label: "Isya", icon: Moon },
];

export const FULL_SCHEDULE: { key: PrayerKey; label: string; icon: LucideIcon }[] = [
  { key: "subuh", label: "Subuh", icon: Sunrise },
  { key: "terbit", label: "Terbit", icon: Sun },
  { key: "dhuha", label: "Dhuha", icon: SunMedium },
  { key: "dzuhur", label: "Dzuhur", icon: Sun },
  { key: "ashar", label: "Ashar", icon: CloudSun },
  { key: "maghrib", label: "Maghrib", icon: Sunset },
  { key: "isya", label: "Isya", icon: Moon },
];

export function secondsUntil(time: string, nowHms: string): number {
  const [nh, nm, ns = 0] = nowHms.split(":").map(Number);
  const [th, tm] = time.split(":").map(Number);
  return th * 3600 + tm * 60 - (nh * 3600 + nm * 60 + ns);
}

export function findNextPrayer(
  schedule: PrayerSchedule,
  clock: string
): { key: PrayerKey; label: string; time: string; icon: LucideIcon; seconds: number } | null {
  for (const p of PRAYERS) {
    const diff = secondsUntil(schedule[p.key], clock);
    if (diff > 0) {
      return { ...p, time: schedule[p.key], seconds: diff };
    }
  }
  const untilSubuh = secondsUntil(schedule.subuh, clock) + 24 * 3600;
  const subuh = PRAYERS[0];
  return { ...subuh, time: schedule.subuh, seconds: untilSubuh };
}

export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const TIMEZONE_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

export function formatTimezoneLabel(timezone: string): string {
  const tz = timezone || "Asia/Jakarta";
  return TIMEZONE_LABELS[tz] ?? "WIB";
}

export function formatDisplayDate(timezone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone || "Asia/Jakarta",
  }).format(new Date());
}
