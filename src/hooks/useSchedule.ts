import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PrayerSchedule } from "@/lib/prayer";

export function useSchedule(cityId?: string) {
  const [schedule, setSchedule] = useState<PrayerSchedule | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSchedule = useCallback(() => {
    setLoading(true);
    invoke<PrayerSchedule | null>("get_today_schedule")
      .then((entry) => {
        setSchedule(entry);
        setScheduleError(entry ? null : "Jadwal belum tersedia");
      })
      .catch((err) => {
        setScheduleError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSchedule();
    const interval = setInterval(loadSchedule, 60_000);
    return () => clearInterval(interval);
  }, [cityId, loadSchedule]);

  return { schedule, scheduleError, loading, reload: loadSchedule };
}