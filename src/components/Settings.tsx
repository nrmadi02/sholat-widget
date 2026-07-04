import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Volume2, VolumeX } from "lucide-react";
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
  const {
    currentVersion,
    updateInfo,
    status: updateStatus,
    error: updateError,
    checkUpdate,
  } = useUpdate(cfg);

  // Sync local state when config changes from another window
  useEffect(() => {
    if (!open) setCfg(config);
  }, [config, open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
        {/* sticky header */}
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>Pengaturan</DialogTitle>
          <DialogDescription>
            Lokasi, volume bedug, dan perilaku widget.
          </DialogDescription>
        </DialogHeader>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FieldGroup className="gap-4">
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
                <CardTitle className="text-sm">Audio</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>Volume bedug</FieldLabel>
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
                    aria-label="Volume bedug"
                  />
                </Field>

                <Field orientation="horizontal">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <FieldLabel>Bisukan notifikasi</FieldLabel>
                  </div>
                  <Switch
                    checked={cfg.muted}
                    onCheckedChange={toggleMute}
                    aria-label="Bisukan notifikasi"
                  />
                </Field>
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

        {/* sticky footer */}
        <div className="shrink-0 border-t bg-muted/30 px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            {cfg.muted ? (
              <VolumeX className="size-3.5 shrink-0" />
            ) : (
              <Volume2 className="size-3.5 shrink-0" />
            )}
            <span>{cfg.muted ? "Notifikasi dibisukan" : "Notifikasi aktif"}</span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}