import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type WindowLabel = "tray" | "main" | "reminder";

export function useWindowLabel(): WindowLabel | null {
  const [label, setLabel] = useState<WindowLabel | null>(null);

  useEffect(() => {
    try {
      const current = getCurrentWebviewWindow().label;
      if (current === "main" || current === "reminder") {
        setLabel(current);
      } else {
        setLabel("tray");
      }
    } catch {
      setLabel("tray");
    }
  }, []);

  return label;
}