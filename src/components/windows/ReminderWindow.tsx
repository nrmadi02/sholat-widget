import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  clearPrayerReminderNotification,
  updatePrayerNotification,
} from "@/lib/notifications";

const PRAYER_ICONS: Record<string, string> = {
  Subuh: "🌙",
  Dzuhur: "☀️",
  Ashar: "🌤️",
  Maghrib: "🌅",
  Isya: "🌙",
};

interface ReminderContext {
  prayer: string;
  seconds_until_prayer: number;
  azan_playing: boolean;
  azan_started_at_ms: number | null;
}

export function ReminderWindow() {
  const [prayer, setPrayer] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [soundProgress, setSoundProgress] = useState(0);
  const soundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundStartedAtRef = useRef(0);
  const soundStoppedRef = useRef(false);
  const playbackSyncedRef = useRef(false);
  const playingRef = useRef(false);

  const clearSoundTimer = useCallback(() => {
    if (soundTimerRef.current) {
      clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
    }
  }, []);

  const unlockPopupUi = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    setSoundProgress(0);
    playbackSyncedRef.current = false;
    setShowReplay(true);
    void invoke("set_azan_playback_locked_cmd", { locked: false });
  }, []);

  const resetSoundUi = useCallback(() => {
    clearSoundTimer();
    soundStoppedRef.current = false;
    unlockPopupUi();
  }, [clearSoundTimer, unlockPopupUi]);

  const stopAzan = useCallback(async () => {
    soundStoppedRef.current = true;
    clearSoundTimer();
    unlockPopupUi();
    try {
      await invoke("stop_test_sound");
      await clearPrayerReminderNotification();
    } catch {
      // audio may already be stopped
    }
  }, [clearSoundTimer, unlockPopupUi]);

  const dismissPopup = useCallback(async () => {
    if (playingRef.current) return;
    try {
      await invoke("close_reminder_window");
      await clearPrayerReminderNotification();
      setPrayer(null);
      setSecondsLeft(null);
    } catch {
      // locked or already dismissed
    }
  }, []);

  const beginPlaybackUi = useCallback(
    async (
      prayerName: string,
      options?: { skipSound?: boolean; startedAtMs?: number },
    ) => {
      if (playbackSyncedRef.current) return;

      playbackSyncedRef.current = true;
      soundStoppedRef.current = false;
      playingRef.current = true;
      setPlaying(true);
      setShowReplay(false);
      setSoundProgress(0);
      soundStartedAtRef.current = options?.startedAtMs ?? Date.now();
      await invoke("set_azan_playback_locked_cmd", { locked: true });

      let durationMs = 3000;
      try {
        durationMs = await invoke<number>("get_azan_duration_ms");
      } catch {
        // fallback
      }

      const elapsed = Date.now() - soundStartedAtRef.current;
      const initialProgress = Math.min(100, (elapsed / durationMs) * 100);
      setSoundProgress(initialProgress);
      await updatePrayerNotification(prayerName, "playing", initialProgress);

      clearSoundTimer();
      soundTimerRef.current = setInterval(() => {
        if (soundStoppedRef.current) return;

        const progressElapsed = Date.now() - soundStartedAtRef.current;
        const progress = Math.min(100, (progressElapsed / durationMs) * 100);
        setSoundProgress(progress);
        void updatePrayerNotification(prayerName, "playing", progress);

        if (progress >= 100) {
          clearSoundTimer();
          setTimeout(() => {
            resetSoundUi();
            void clearPrayerReminderNotification();
          }, 300);
        }
      }, 250);

      if (!options?.skipSound) {
        void invoke("test_sound");
      }
    },
    [clearSoundTimer, resetSoundUi],
  );

  const refreshContext = useCallback(async () => {
    try {
      const ctx = await invoke<ReminderContext | null>("get_reminder_context");
      if (!ctx) {
        if (!playingRef.current) {
          setPrayer(null);
          setSecondsLeft(null);
        }
        return;
      }

      setPrayer(ctx.prayer);
      setSecondsLeft(ctx.seconds_until_prayer);

      if (
        ctx.azan_playing &&
        !playbackSyncedRef.current &&
        !soundStoppedRef.current
      ) {
        await beginPlaybackUi(ctx.prayer, {
          skipSound: true,
          startedAtMs: ctx.azan_started_at_ms ?? Date.now(),
        });
      } else if (!ctx.azan_playing && !playingRef.current) {
        setShowReplay(true);
      } else if (!ctx.azan_playing && playingRef.current) {
        unlockPopupUi();
      }
    } catch {
      // ignore transient errors
    }
  }, [beginPlaybackUi, resetSoundUi, unlockPopupUi]);

  useEffect(() => {
    void refreshContext();
    const poll = setInterval(() => void refreshContext(), 1000);

    let clearedUnlisten: (() => void) | undefined;
    let dismissedUnlisten: (() => void) | undefined;
    let reminderUnlisten: (() => void) | undefined;
    let stoppedUnlisten: (() => void) | undefined;

    listen("reminder-cleared", () => {
      setPrayer(null);
      setSecondsLeft(null);
      void stopAzan();
    }).then((fn) => {
      clearedUnlisten = fn;
    });

    listen("reminder-dismissed", () => {
      setPrayer(null);
      setSecondsLeft(null);
      void clearPrayerReminderNotification();
    }).then((fn) => {
      dismissedUnlisten = fn;
    });

    listen("prayer-reminder", () => {
      void refreshContext();
    }).then((fn) => {
      reminderUnlisten = fn;
    });

    listen("azan-stopped", () => {
      soundStoppedRef.current = true;
      clearSoundTimer();
      unlockPopupUi();
    }).then((fn) => {
      stoppedUnlisten = fn;
    });

    return () => {
      clearInterval(poll);
      clearedUnlisten?.();
      dismissedUnlisten?.();
      reminderUnlisten?.();
      stoppedUnlisten?.();
      clearSoundTimer();
      void invoke("set_azan_playback_locked_cmd", { locked: false });
    };
  }, [refreshContext, stopAzan, clearSoundTimer, unlockPopupUi]);

  const replayAzan = async () => {
    if (playingRef.current || !prayer) return;
    playbackSyncedRef.current = false;
    soundStoppedRef.current = false;
    await beginPlaybackUi(prayer);
  };

  const emoji = prayer ? (PRAYER_ICONS[prayer] ?? "🕌") : "🕌";

  return (
    <div className="flex h-screen w-screen items-center justify-center p-3">
      <div
        className="glass relative flex w-full flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ backdropFilter: "blur(24px)" }}
      >
        {!playing && (
          <button
            onClick={() => void dismissPopup()}
            className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-black/10 text-foreground/60 transition-colors hover:bg-black/20"
            aria-label="Tutup"
          >
            <X className="size-3.5" />
          </button>
        )}

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

        {playing && (
          <p className="mx-5 mb-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            Azan sedang diputar — tutup popup setelah Stop
          </p>
        )}

        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Waktu sholat{" "}
          <span className="font-semibold text-foreground">{prayer}</span>{" "}
          {secondsLeft !== null && secondsLeft > 0
            ? `dalam ${secondsLeft} detik.`
            : secondsLeft === 0
              ? "sudah tiba."
              : "segera tiba."}
        </p>

        {playing && (
          <div className="mx-5 mb-3 flex flex-col gap-2 rounded-lg border border-white/20 bg-white/15 px-3 py-2.5">
            <Progress value={soundProgress} className="h-1.5" />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Memutar azan — {Math.round(soundProgress)}%
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => void stopAzan()}
              >
                <Square data-icon="inline-start" className="size-3" />
                Stop
              </Button>
            </div>
          </div>
        )}

        {!playing && (
          <div className="flex gap-2 border-t border-white/20 bg-white/20 px-4 py-3">
            {showReplay && (
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={() => void replayAzan()}
              >
                <RotateCcw data-icon="inline-start" className="size-3.5" />
                Putar ulang
              </Button>
            )}
            <Button
              variant={showReplay ? "ghost" : "default"}
              size="sm"
              className={showReplay ? "text-xs" : "flex-1 text-xs"}
              onClick={() => void dismissPopup()}
            >
              Tutup
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}