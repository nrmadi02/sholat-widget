import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bell, BellOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import {
  hasNotificationPermission,
  openNotificationSettings,
  requestNotificationPermission,
} from "@/lib/notifications";
import { LocationPicker } from "./LocationPicker";
import type { AppConfig } from "@/types/config";
import { useUpdate, formatLastCheck } from "@/hooks/useUpdate";
import changelogRaw from "../../CHANGELOG.md?raw";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function Settings({
  config,
  open,
  onOpenChange,
  onSaved,
}: {
  config: AppConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (cfg: AppConfig) => void;
}) {
  const [cfg, setCfg] = useState<AppConfig>(config);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const {
    currentVersion,
    updateInfo,
    status: updateStatus,
    error: updateError,
    checkUpdate,
  } = useUpdate(cfg);

  useEffect(() => {
    if (!open) setCfg(config);
  }, [config, open]);

  useEffect(() => {
    if (!open) return;
    hasNotificationPermission()
      .then(setPermissionGranted)
      .catch(() => setPermissionGranted(false));
  }, [open]);

  const persist = async (updated: AppConfig) => {
    try {
      const saved = await invoke<AppConfig>("save_settings", { config: updated });
      setCfg(saved);
      onSaved?.(saved);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const updateVolume = async (value: number | readonly number[]) => {
    const values = Array.isArray(value) ? value : [value];
    await persist({ ...cfg, volume: values[0] / 100 });
  };

  const toggleMute = async (checked: boolean) => {
    await persist({ ...cfg, muted: checked });
  };

  const toggleAutoLaunch = async (checked: boolean) => {
    await persist({ ...cfg, auto_launch: checked });
  };

  const toggleReminder = async (checked: boolean) => {
    if (!checked) {
      await persist({ ...cfg, notifications_enabled: false });
      return;
    }

    const granted =
      permissionGranted || (await requestNotificationPermission());
    setPermissionGranted(granted);

    if (!granted) {
      setError(
        "Izin notifikasi belum diberikan. Aktifkan di Pengaturan Sistem terlebih dahulu.",
      );
      await persist({ ...cfg, notifications_enabled: false });
      return;
    }

    setError(null);
    await persist({ ...cfg, notifications_enabled: true });
  };

  const reminderActive = cfg.notifications_enabled && permissionGranted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>Pengaturan</DialogTitle>
          <DialogDescription>
            Pengingat sholat, suara azan, dan perilaku widget.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FieldGroup className="gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Pengingat Sholat</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field orientation="horizontal">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <FieldLabel>Aktifkan pengingat</FieldLabel>
                    <p className="text-xs text-muted-foreground">
                      1 menit sebelum waktu sholat. Butuh izin notifikasi OS.
                    </p>
                  </div>
                  <Switch
                    checked={reminderActive}
                    onCheckedChange={toggleReminder}
                    aria-label="Aktifkan pengingat sholat"
                  />
                </Field>

                <Field orientation="horizontal">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <FieldLabel>Bisukan suara azan</FieldLabel>
                    <p className="text-xs text-muted-foreground">
                      Pengingat tetap jalan, tanpa bunyi.
                    </p>
                  </div>
                  <Switch
                    checked={cfg.muted}
                    onCheckedChange={toggleMute}
                    aria-label="Bisukan suara azan"
                  />
                </Field>

                {!permissionGranted && (
                  <Alert>
                    <AlertDescription className="flex flex-col gap-2">
                      <span>
                        Izin notifikasi belum diberikan. Tanpa izin ini,
                        pengingat tidak akan berjalan otomatis.
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() => void openNotificationSettings()}
                      >
                        Buka Pengaturan Sistem
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Suara Azan</CardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Volume</FieldLabel>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {Math.round(cfg.volume * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[Math.round(cfg.volume * 100)]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={updateVolume}
                    aria-label="Volume azan"
                    disabled={cfg.muted}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lokasi</CardTitle>
              </CardHeader>
              <CardContent>
                <LocationPicker
                  config={cfg}
                  onSaved={(saved) => {
                    setCfg(saved);
                    onSaved?.(saved);
                  }}
                  onError={setError}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sistem</CardTitle>
              </CardHeader>
              <CardContent>
                <Field orientation="horizontal">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <FieldLabel>Mulai saat komputer dinyalakan</FieldLabel>
                  </div>
                  <Switch
                    checked={cfg.auto_launch}
                    onCheckedChange={toggleAutoLaunch}
                    aria-label="Mulai saat komputer dinyalakan"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tentang</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Versi saat ini</p>
                    <p className="font-mono font-medium">v{currentVersion}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Versi terbaru</p>
                    <p className="font-mono font-medium">
                      {updateInfo && updateInfo.version !== currentVersion
                        ? `v${updateInfo.version}`
                        : "—"}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Pemeriksaan terakhir: {formatLastCheck(cfg.last_update_check_at)}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkUpdate(true)}
                  disabled={updateStatus === "checking"}
                  className="w-full"
                >
                  <RefreshCw
                    data-icon="inline-start"
                    className={updateStatus === "checking" ? "animate-spin" : ""}
                  />
                  {updateStatus === "checking" ? "Memeriksa..." : "Periksa Update"}
                </Button>

                {updateStatus === "idle" && updateInfo === null && cfg.last_update_check_at && (
                  <p className="text-xs text-emerald-600">Anda menggunakan versi terbaru.</p>
                )}

                {updateError && (
                  <Alert variant="destructive">
                    <AlertDescription>{updateError}</AlertDescription>
                  </Alert>
                )}

                <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Riwayat perubahan
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                    {changelogRaw.replace(/^# Changelog\n\n/, "")}
                  </pre>
                </div>
              </CardContent>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </div>

        <div className="shrink-0 border-t bg-muted/30 px-5 py-4">
          <div className="mb-3 flex flex-col gap-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {reminderActive ? (
                <Bell className="size-3.5 shrink-0 text-emerald-600" />
              ) : (
                <BellOff className="size-3.5 shrink-0 text-amber-600" />
              )}
              <span>
                {reminderActive
                  ? "Pengingat aktif — 1 menit sebelum sholat"
                  : "Pengingat nonaktif"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {cfg.muted ? (
                <VolumeX className="size-3.5 shrink-0" />
              ) : (
                <Volume2 className="size-3.5 shrink-0" />
              )}
              <span>{cfg.muted ? "Suara azan dibisukan" : "Suara azan aktif"}</span>
            </div>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}