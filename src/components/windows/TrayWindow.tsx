import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { AppWindow, CheckCircle2 } from "lucide-react";
import { useLiveClock } from "@/hooks/useTauriCommand";
import { useConfig } from "@/hooks/useConfig";
import { useSchedule } from "@/hooks/useSchedule";
import { Settings } from "@/components/Settings";
import { UpdateDialog } from "@/components/UpdateDialog";
import { UpdateBadge } from "@/components/UpdateBadge";
import { useUpdate } from "@/hooks/useUpdate";
import { MosqueIcon } from "@/components/icons/Mosque";
import {
  findNextPrayer,
  formatCountdown,
  formatDisplayDate,
  formatTimezoneLabel,
} from "@/lib/prayer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const EASE_SNAP = [0.22, 1, 0.36, 1] as const;

const trayVariants: Variants = {
  hidden: {
    opacity: 0,
    transform: "translateY(-18px) scale(0.97)",
  },
  visible: {
    opacity: 1,
    transform: "translateY(0) scale(1)",
    transition: { duration: 0.2, ease: EASE_SNAP, staggerChildren: 0.04 },
  },
  exit: {
    opacity: 0,
    transform: "translateY(-14px) scale(0.98)",
    transition: { duration: 0.16, ease: EASE_SNAP },
  },
  reducedVisible: {
    opacity: 1,
    transform: "translateY(0) scale(1)",
    transition: { duration: 0.15, ease: EASE_SNAP },
  },
  reducedExit: {
    opacity: 0,
    transform: "translateY(0) scale(1)",
    transition: { duration: 0.15, ease: EASE_SNAP },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15, ease: EASE_SNAP },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.1, ease: EASE_SNAP },
  },
};

export function TrayWindow() {
  const clock = useLiveClock();
  const { config: activeConfig } = useConfig();
  const {
    updateInfo,
    status: updateStatus,
    error: updateError,
    progress,
    hasUpdate,
    dismissUpdate,
    installUpdate,
    formatBytes,
  } = useUpdate(activeConfig);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const { schedule, scheduleError, loading, reload } = useSchedule(
    activeConfig?.city_id,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controls = useAnimationControls();
  const prefersReducedMotion = useReducedMotion();
  const isHidingRef = useRef(false);

  const enterVariant = prefersReducedMotion ? "reducedVisible" : "visible";
  const exitVariant = prefersReducedMotion ? "reducedExit" : "exit";

  const requestHide = useCallback(async () => {
    if (settingsOpen || isHidingRef.current) return;

    isHidingRef.current = true;
    try {
      await controls.start(exitVariant);
      await invoke("hide_tray_window");
      controls.set("hidden");
    } finally {
      isHidingRef.current = false;
    }
  }, [controls, exitVariant, settingsOpen]);

  useEffect(() => {
    void controls.start(enterVariant);
  }, [controls, enterVariant]);

  useEffect(() => {
    if (settingsOpen) return;

    const win = getCurrentWebviewWindow();
    const unlisteners: Array<() => void> = [];

    void win
      .listen("tauri://focus", () => {
        isHidingRef.current = false;
        void controls.start(enterVariant);
      })
      .then((fn) => {
        unlisteners.push(fn);
      });

    void win
      .listen("tauri://blur", () => {
        void requestHide();
      })
      .then((fn) => {
        unlisteners.push(fn);
      });

    void win
      .listen("tray-hide-requested", () => {
        void requestHide();
      })
      .then((fn) => {
        unlisteners.push(fn);
      });

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [controls, enterVariant, requestHide, settingsOpen]);

  const next = schedule ? findNextPrayer(schedule, clock) : null;
  const displayTime = clock.slice(0, 5);
  const timezone = activeConfig?.timezone ?? "Asia/Jakarta";

  const openMainApp = async () => {
    if (isHidingRef.current) return;

    isHidingRef.current = true;
    try {
      await controls.start(exitVariant);
      await invoke("hide_tray_window");
      controls.set("hidden");
      await invoke("open_main_window");
    } catch (err) {
      toast.error(String(err));
    } finally {
      isHidingRef.current = false;
    }
  };

  return (
    <>
      <motion.div
        className="glass w-full overflow-hidden rounded-2xl!"
        style={{ transformOrigin: "top center" }}
        variants={trayVariants}
        initial="hidden"
        animate={controls}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.header
          variants={sectionVariants}
          className="flex items-center gap-3 border-b border-white/20 px-5 pb-3 pt-4"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-600 to-orange-600 text-white">
            <MosqueIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-semibold leading-none tracking-tight text-foreground">
              Sholat Widget
            </p>
            {activeConfig ? (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {activeConfig.city_name} · {formatTimezoneLabel(timezone)}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
                Memuat...
              </p>
            )}
          </div>
          {hasUpdate && (
            <UpdateBadge compact onClick={() => setUpdateDialogOpen(true)} />
          )}
        </motion.header>

        {/* ── Live Clock ─────────────────────────────────────────── */}
        <motion.section
          variants={sectionVariants}
          className="border-b border-white/20 bg-white/25 px-5 py-4 text-center"
        >
          <p
            className="font-mono text-6xl font-semibold tabular-nums tracking-[-0.04em] text-foreground"
            aria-live="polite"
          >
            {displayTime}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDisplayDate(timezone)}
          </p>
        </motion.section>

        {/* ── Next Prayer ────────────────────────────────────────── */}
        <motion.section variants={sectionVariants} className="px-5 pb-5 pt-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Sholat selanjutnya
          </p>

          {loading && !schedule ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-10 w-28" />
            </div>
          ) : next ? (
            <>
              <div className="flex items-baseline justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <next.icon className="size-5 shrink-0 text-primary" />
                    <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
                      {next.label}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-3xl font-semibold tabular-nums text-primary">
                    {next.time}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-muted-foreground">dalam</p>
                  <p
                    className="font-mono text-xl font-semibold tabular-nums text-primary"
                    aria-live="polite"
                  >
                    {formatCountdown(next.seconds)}
                  </p>
                </div>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5 shrink-0" />
                Akan ada pengingat + azan
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {scheduleError ?? "Memuat jadwal..."}
            </p>
          )}
        </motion.section>

        {/* ── Quick Actions ──────────────────────────────────────── */}
        <motion.footer
          variants={sectionVariants}
          className="flex gap-2 border-t border-white/20 bg-white/35 px-4 py-3"
        >
          <Button
            size="sm"
            className="flex-1 text-xs transition-transform active:scale-[0.96]"
            onClick={openMainApp}
          >
            <AppWindow data-icon="inline-start" />
            Buka Aplikasi
          </Button>
        </motion.footer>
      </motion.div>

      {activeConfig && (
        <Settings
          config={activeConfig}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={() => reload()}
        />
      )}

      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        updateInfo={updateInfo}
        status={updateStatus}
        error={updateError}
        progress={progress}
        formatBytes={formatBytes}
        onInstall={() => installUpdate()}
        onDismiss={() => dismissUpdate()}
      />
    </>
  );
}
