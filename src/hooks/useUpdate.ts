import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Channel } from "@tauri-apps/api/core";
import type { AppConfig } from "@/types/config";

export const UPDATE_AVAILABLE_EVENT = "update-available";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string | null;
  date?: string | null;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

interface DownloadProgress {
  downloaded: number;
  total: number | null;
  percent: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatLastCheck(ts: number | null | undefined): string {
  if (!ts) return "Belum pernah";
  const date = new Date(ts * 1000);
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useUpdate(config?: AppConfig | null) {
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setCurrentVersion)
      .catch(() => setCurrentVersion("?"));
  }, []);

  useEffect(() => {
    if (
      config?.update_dismissed_version &&
      updateInfo?.version === config.update_dismissed_version
    ) {
      setDismissed(true);
    } else {
      setDismissed(false);
    }
  }, [config?.update_dismissed_version, updateInfo?.version]);

  useEffect(() => {
    const unlisten = listen<UpdateInfo>(UPDATE_AVAILABLE_EVENT, (event) => {
      setUpdateInfo(event.payload);
      setStatus("available");
      setError(null);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const checkUpdate = useCallback(async (force = false) => {
    setStatus("checking");
    setError(null);
    try {
      const info = await invoke<UpdateInfo | null>("check_update", { force });
      if (info) {
        setUpdateInfo(info);
        setStatus("available");
      } else {
        setUpdateInfo(null);
        setStatus("idle");
      }
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const dismissUpdate = useCallback(async () => {
    if (!updateInfo || !config) return;
    const updated: AppConfig = {
      ...config,
      update_dismissed_version: updateInfo.version,
    };
    await invoke("save_settings", { config: updated });
    setDismissed(true);
  }, [config, updateInfo]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo) return;
    setStatus("downloading");
    setError(null);
    setProgress({ downloaded: 0, total: null, percent: 0 });

    try {
      const channel = new Channel<{
        event: string;
        data: {
          contentLength?: number | null;
          chunkLength?: number;
        };
      }>();

      channel.onmessage = (msg) => {
        if (msg.event === "Started") {
          const total = msg.data.contentLength ?? null;
          setProgress({ downloaded: 0, total, percent: 0 });
        } else if (msg.event === "Progress") {
          setProgress((prev) => {
            const downloaded = (prev?.downloaded ?? 0) + (msg.data.chunkLength ?? 0);
            const total = prev?.total ?? null;
            const percent =
              total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
            return { downloaded, total, percent };
          });
        } else if (msg.event === "Finished") {
          setStatus("installing");
          setProgress((prev) =>
            prev ? { ...prev, percent: 100 } : { downloaded: 0, total: null, percent: 100 },
          );
        }
      };

      await invoke("install_update", { onEvent: channel });
    } catch (err) {
      setError(String(err));
      setStatus("error");
      setProgress(null);
    }
  }, [updateInfo]);

  const hasUpdate =
    updateInfo !== null &&
    !dismissed &&
    updateInfo.version !== currentVersion;

  return {
    currentVersion,
    updateInfo,
    status,
    error,
    progress,
    hasUpdate,
    dismissed,
    checkUpdate,
    dismissUpdate,
    installUpdate,
    formatBytes,
  };
}