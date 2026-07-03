import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Popup } from "./components/Popup";
import { Onboarding } from "./components/Onboarding";

interface AppConfig {
  onboarding_done: boolean;
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setOnboardingDone(cfg.onboarding_done))
      .catch(() => setOnboardingDone(false));
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const unlisten = listen<string>("prayer-reminder", (event) => {
      setReminder(event.payload);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setReminder(null), 60000);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unlisten.then((fn) => fn());
    };
  }, []);

  if (onboardingDone === null) {
    return <div>Loading...</div>;
  }

  return (
    <>
      {reminder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#1a7f37",
            color: "white",
            padding: 12,
            textAlign: "center",
            fontWeight: 600,
            zIndex: 1000,
          }}
        >
          🕌 Waktu {reminder} segera — dalam 5 menit!
        </div>
      )}
      {!onboardingDone ? (
        <Onboarding onDone={() => setOnboardingDone(true)} />
      ) : (
        <Popup />
      )}
    </>
  );
}

export default App;