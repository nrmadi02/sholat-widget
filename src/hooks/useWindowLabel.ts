import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type WindowLabel = "tray" | "main";

export function useWindowLabel(): WindowLabel | null {
  const [label, setLabel] = useState<WindowLabel | null>(null);

  useEffect(() => {
    try {
      const current = getCurrentWebviewWindow().label;
      setLabel(current === "main" ? "main" : "tray");
    } catch {
      setLabel("tray");
    }
  }, []);

  return label;
}