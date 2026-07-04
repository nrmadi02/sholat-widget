import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AppWindow,
  CheckCircle2,
  Settings as SettingsIcon,
} from "lucide-react";
import { useLiveClock } from "@/hooks/useTauriCommand";
import { useConfig } from "@/hooks/useConfig";
import { useSchedule } from "@/hooks/useSchedule";
import { Settings } from "@/components/Settings";
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

export function TrayWindow() {
  const clock = useLiveClock();
  const { config: activeConfig } = useConfig();
  const { schedule, scheduleError, loading, reload } = useSchedule(
    activeConfig?.city_id,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (settingsOpen) return;

    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow()
      .listen("tauri://blur", () => {
        void invoke("hide_tray_window");
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [settingsOpen]);

  const next = schedule ? findNextPrayer(schedule, clock) : null;
  const displayTime = clock.slice(0, 5);
  const timezone = activeConfig?.timezone ?? "Asia/Jakarta";

  const openMainApp = async () => {
    try {
      await invoke("open_main_window");
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <>
      <div className="glass w-full overflow-hidden rounded-2xl!">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="popup-stagger-1 flex items-center gap-3 border-b border-white/20 px-5 pb-3 pt-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-600 to-orange-600 text-white shadow-sm">
            <MosqueIcon className="size-4" />
          </div>
          <div className="min-w-0">
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
        </header>

        {/* ── Live Clock ─────────────────────────────────────────── */}
        <section className="popup-stagger-2 border-b border-white/20 bg-white/25 px-5 py-4 text-center">
          <p
            className="font-mono text-6xl font-semibold tabular-nums tracking-[-0.04em] text-foreground"
            aria-live="polite"
          >
            {displayTime}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDisplayDate(timezone)}
          </p>
        </section>

        {/* ── Next Prayer ────────────────────────────────────────── */}
        <section className="popup-stagger-3 px-5 pb-5 pt-4">
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
                    className="font-mono text-4xl font-semibold tabular-nums text-primary"
                    aria-live="polite"
                  >
                    {formatCountdown(next.seconds)}
                  </p>
                </div>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5 shrink-0" />5 menit sebelumnya
                akan ada pengingat + bedug
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {scheduleError ?? "Memuat jadwal..."}
            </p>
          )}
        </section>

        {/* ── Quick Actions ──────────────────────────────────────── */}
        <footer className="popup-stagger-4 flex gap-2 border-t border-white/20 bg-white/35 px-4 py-3">
          <Button
            size="sm"
            className="flex-1 text-xs transition-transform active:scale-[0.96]"
            onClick={openMainApp}
          >
            <AppWindow data-icon="inline-start" />
            Buka Aplikasi
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs transition-transform active:scale-[0.96]"
            onClick={() => setSettingsOpen(true)}
            aria-label="Pengaturan"
          >
            <SettingsIcon data-icon="inline-start" />
            Settings
          </Button>
        </footer>
      </div>

      {activeConfig && (
        <Settings
          config={activeConfig}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={() => reload()}
        />
      )}
    </>
  );
}
