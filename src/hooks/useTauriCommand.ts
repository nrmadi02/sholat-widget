import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/**
 * Generic hook to invoke a Tauri command and hold its result.
 */
export function useTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<T>(command, args)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [command, JSON.stringify(args)]);

  return { data, error };
}

/**
 * Polls the Rust time service every second for accurate local time.
 * Uses NTP-synced time, NOT browser Date.now().
 */
export function useLiveClock() {
  const [time, setTime] = useState<string>("--:--:--");

  useEffect(() => {
    const fetchTime = () => {
      invoke<string>("get_current_time")
        .then(setTime)
        .catch(() => setTime("--:--:--"));
    };
    fetchTime();
    const interval = setInterval(fetchTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}