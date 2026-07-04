import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CONFIG_UPDATED_EVENT } from "@/hooks/useConfig";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { Onboarding } from "./components/Onboarding";
import { TrayWindow } from "./components/windows/TrayWindow";
import { MainWindow } from "./components/windows/MainWindow";
import { ReminderWindow } from "./components/windows/ReminderWindow";
import { useWindowLabel } from "./hooks/useWindowLabel";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface AppConfig {
  onboarding_done: boolean;
}

function App() {
  const windowLabel = useWindowLabel();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setOnboardingDone(cfg.onboarding_done))
      .catch(() => setOnboardingDone(false));

    let unlisten: (() => void) | undefined;
    listen<AppConfig>(CONFIG_UPDATED_EVENT, (event) => {
      setOnboardingDone(event.payload.onboarding_done);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    async function ensureNotificationPermission() {
      const granted = await isPermissionGranted();
      if (!granted) {
        await requestPermission();
      }
    }
    ensureNotificationPermission().catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (windowLabel === null || onboardingDone === null) {
    return (
      <div className="glass flex min-h-full w-full flex-col gap-4 rounded-xl p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const renderSurface = () => {
    if (windowLabel === "main") {
      return <MainWindow />;
    }

    if (windowLabel === "reminder") {
      return <ReminderWindow />;
    }

    if (!onboardingDone) {
      return <Onboarding onDone={() => setOnboardingDone(true)} />;
    }

    return <TrayWindow />;
  };

  return (
    <>
      {renderSurface()}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}

export default App;