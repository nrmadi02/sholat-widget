import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useLiveClock } from "@/hooks/useTauriCommand";
import { useConfig } from "@/hooks/useConfig";
import { useSchedule } from "@/hooks/useSchedule";
import { Settings } from "@/components/Settings";
import { PrayerRow } from "@/components/PrayerRow";
import { MosqueIcon } from "@/components/icons/Mosque";
import type { AppConfig } from "@/types/config";
import {
  FULL_SCHEDULE,
  findNextPrayer,
  formatCountdown,
  formatDisplayDate,
  formatTimezoneLabel,
} from "@/lib/prayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function MainWindow() {
  const clock = useLiveClock();
  const { config: activeConfig, error: configError } = useConfig();
  const { schedule, scheduleError, loading, reload } = useSchedule(activeConfig?.city_id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const next = schedule ? findNextPrayer(schedule, clock) : null;
  const displayTime = clock.slice(0, 5);
  const timezone = activeConfig?.timezone ?? "Asia/Jakarta";

  const closeWindow = async () => {
    await invoke("hide_main_window_cmd");
  };

  const toggleMute = async () => {
    if (!activeConfig) return;
    const updated = { ...activeConfig, muted: !activeConfig.muted };
    await invoke<AppConfig>("save_settings", { config: updated });
  };

  if (configError) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Gagal memuat konfigurasi</EmptyTitle>
            <EmptyDescription>{configError}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!activeConfig?.onboarding_done) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Onboarding belum selesai</EmptyTitle>
            <EmptyDescription>
              Buka widget dari ikon tray untuk menyelesaikan setup.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="animate-app-enter flex min-h-full flex-col bg-background">
        <header className="flex items-center justify-between border-b border-border/40 bg-card/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <MosqueIcon />
            </div>
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">
                Sholat Widget
              </p>
              <p className="text-xs text-primary">
                {activeConfig.city_name} · {formatTimezoneLabel(timezone)} · Widget aktif
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={reload} aria-label="Refresh jadwal">
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon data-icon="inline-start" />
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              aria-label={activeConfig.muted ? "Unmute" : "Mute"}
            >
              {activeConfig.muted ? (
                <VolumeX data-icon="inline-start" />
              ) : (
                <Volume2 data-icon="inline-start" />
              )}
              {activeConfig.muted ? "Unmute" : "Mute"}
            </Button>
            {activeConfig.muted && (
              <Badge variant="secondary" className="gap-1">
                <VolumeX className="size-3" />
                Mute
              </Badge>
            )}
            <Button variant="ghost" size="icon-sm" onClick={closeWindow} aria-label="Tutup">
              <X />
            </Button>
          </div>
        </header>

        <section className="flex items-center justify-between border-b border-border/40 px-8 pb-6 pt-8">
          <div>
            <p
              className="font-mono text-7xl font-semibold tabular-nums tracking-tight text-foreground"
              aria-live="polite"
            >
              {displayTime}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDisplayDate(timezone)}
            </p>
          </div>

          {next && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Sholat selanjutnya
              </p>
              <div className="mt-1 flex items-center gap-2">
                <next.icon className="text-primary" />
                <div>
                  <p className="font-display text-2xl font-semibold tracking-tight">
                    {next.label}
                  </p>
                  <p className="font-mono text-xl tabular-nums text-primary">
                    {next.time} ·{" "}
                    <span className="font-semibold" aria-live="polite">
                      {formatCountdown(next.seconds)}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-1 flex-col gap-3 px-8 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Jadwal sholat hari ini
          </p>

          {loading && !schedule ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : scheduleError && !schedule ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Jadwal tidak tersedia</EmptyTitle>
                <EmptyDescription>{scheduleError}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" size="sm" onClick={reload}>
                Coba lagi
              </Button>
            </Empty>
          ) : schedule ? (
            <Card className="border-border/60 shadow-none">
              <CardContent className="flex flex-col gap-0.5 p-2">
                {FULL_SCHEDULE.map((p) => (
                  <PrayerRow
                    key={p.key}
                    icon={p.icon}
                    label={p.label}
                    time={schedule[p.key]}
                    active={next?.label === p.label}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </section>

        <footer className="border-t border-border/40 px-8 py-3">
          <p className="text-xs text-muted-foreground">
            Sumber: Kemenag · Sinkron NTP · {clock}
          </p>
        </footer>
      </div>

      <Settings
        config={activeConfig}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={() => reload()}
      />
    </>
  );
}