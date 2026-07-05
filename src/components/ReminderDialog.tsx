import { invoke } from "@tauri-apps/api/core";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ReminderDialog({
  prayer,
  open,
  onOpenChange,
}: {
  prayer: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const replaySound = async () => {
    await invoke("test_sound");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pengingat sholat</DialogTitle>
          <DialogDescription>
            Waktu {prayer} dalam 1 menit. Azan berbunyi otomatis saat popup
            muncul.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={replaySound} className="w-full">
            <RotateCcw data-icon="inline-start" />
            Putar ulang
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}