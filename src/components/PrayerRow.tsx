import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrayerRowProps {
  icon: LucideIcon;
  label: string;
  time: string;
  active?: boolean;
}

export function PrayerRow({ icon: Icon, label, time, active }: PrayerRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg px-4 py-3 transition-colors",
        "hover:bg-accent/50",
        active && "border-l-[3px] border-primary bg-primary/8"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className="text-primary" data-icon="inline-start" />
        <span className={cn("font-medium", active && "text-primary")}>{label}</span>
      </div>
      <span
        className={cn(
          "font-mono text-lg tabular-nums",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {time}
      </span>
    </div>
  );
}