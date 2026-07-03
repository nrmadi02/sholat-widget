import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Popup } from "./components/Popup";
import { Onboarding } from "./components/Onboarding";

interface AppConfig {
  onboarding_done: boolean;
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => setOnboardingDone(cfg.onboarding_done))
      .catch(() => setOnboardingDone(false));
  }, []);

  if (onboardingDone === null) {
    return <div>Loading...</div>;
  }
  if (!onboardingDone) {
    return <Onboarding onDone={() => setOnboardingDone(true)} />;
  }
  return <Popup />;
}

export default App;