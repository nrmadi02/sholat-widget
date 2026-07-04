import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRAYER_ICONS: Record<string, string> = {
  Subuh: "🌙",
  Dzuhur: "☀️",
  Ashar: "🌤️",
  Maghrib: "🌅",
  Isya: "🌙",
};

export function ReminderWindow() {
  const [prayer, setPrayer] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    invoke<string | null>("get_pending_reminder")
      .then((p) => setPrayer(p))
      .catch(() => {});
  }, []);

  // Auto-close countdown
  useEffect(() => {
    if (countdown <= 0) {
      void invoke("close_reminder_window");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const close = () => {
    void invoke("close_reminder_window");
  };

  const playBedug = async () => {
    setPlaying(true);
    await invoke("test_sound");
    setTimeout(() => setPlaying(false), 3000);
  };

  const emoji = prayer ? (PRAYER_ICONS[prayer] ?? "🕌") : "🕌";

  return (
    <div className="flex h-screen w-screen items-center justify-center p-3">
      <div
        className="glass relative flex w-full flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ backdropFilter: "blur(24px)" }}
      >
        {/* Close + countdown */}
        <button
          onClick={close}
          className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-black/10 text-foreground/60 transition-colors hover:bg-black/20"
          aria-label="Tutup"
        >
          <X className="size-3.5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-500 to-orange-600 text-xl shadow-sm">
            {emoji}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
              Pengingat Sholat
            </p>
            <p className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
              {prayer ?? "—"}
            </p>
          </div>
        </div>

        {/* Body */}
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Waktu sholat <span className="font-semibold text-foreground">{prayer}</span> sudah
          masuk. Segera bersiap.
        </p>

        {/* Actions */}
        <div className="flex gap-2 border-t border-white/20 bg-white/20 px-4 py-3">
          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={playBedug}
            disabled={playing}
          >
            {playing ? (
              <BellOff className="size-3.5 shrink-0" />
            ) : (
              <Bell className="size-3.5 shrink-0" />
            )}
            {playing ? "Memainkan..." : "Dengar bedug"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={close}
          >
            Tutup ({countdown}s)
          </Button>
        </div>
      </div>
    </div>
  );
}
