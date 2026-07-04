import { invoke } from "@tauri-apps/api/core";
import { Bell } from "lucide-react";
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
  const playSound = async () => {
    await invoke("test_sound");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="text-primary" data-icon="inline-start" />
            Pengingat sholat
          </DialogTitle>
          <DialogDescription>
            Waktu {prayer} segera. Dalam 5 menit.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={playSound} className="w-full">
            Dengar azan
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}