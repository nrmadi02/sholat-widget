import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { AppConfig } from "@/types/config";

export const CONFIG_UPDATED_EVENT = "config-updated";

/** Broadcast the latest config to all open windows. */
export async function broadcastConfig(cfg: AppConfig) {
  await emit(CONFIG_UPDATED_EVENT, cfg);
}

/**
 * Fetches the app config once and keeps it in sync across all windows
 * by listening to the `config-updated` Tauri event.
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(() => {
    invoke<AppConfig>("get_config")
      .then(setConfig)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    fetchConfig();

    let unlisten: (() => void) | undefined;
    listen<AppConfig>(CONFIG_UPDATED_EVENT, (event) => {
      setConfig(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchConfig]);

  return { config, error, setConfig };
}
