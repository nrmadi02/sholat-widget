import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { UpdateInfo, UpdateStatus } from "@/hooks/useUpdate";

export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  status,
  error,
  progress,
  formatBytes,
  onInstall,
  onDismiss,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: UpdateInfo | null;
  status: UpdateStatus;
  error: string | null;
  progress: { downloaded: number; total: number | null; percent: number } | null;
  formatBytes: (bytes: number) => string;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const isBusy = status === "downloading" || status === "installing";

  const handleDismiss = () => {
    onDismiss();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={isBusy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pembaruan tersedia</DialogTitle>
          <DialogDescription>
            Versi baru Sholat Widget siap dipasang.
          </DialogDescription>
        </DialogHeader>

        {updateInfo && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">Versi baru</p>
              <p className="font-display text-xl font-semibold tracking-tight">
                v{updateInfo.version}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saat ini: v{updateInfo.currentVersion}
              </p>
            </div>

            {updateInfo.notes && (
              <div className="max-h-40 overflow-y-auto rounded-lg border px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Perubahan
                </p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {updateInfo.notes}
                </pre>
              </div>
            )}

            {isBusy && progress && (
              <div className="flex flex-col gap-2">
                <Progress value={progress.percent} className="h-2" />
                <p className="text-center text-xs text-muted-foreground">
                  {status === "installing"
                    ? "Memasang pembaruan..."
                    : progress.total
                      ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)} (${progress.percent}%)`
                      : `Mengunduh... ${formatBytes(progress.downloaded)}`}
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss} disabled={isBusy}>
            Nanti
          </Button>
          <Button onClick={onInstall} disabled={isBusy || !updateInfo}>
            {isBusy ? "Memproses..." : "Update Sekarang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}