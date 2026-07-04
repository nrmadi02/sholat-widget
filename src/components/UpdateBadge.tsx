import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function UpdateBadge({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
        aria-label="Pembaruan tersedia"
      >
        <Download className="size-3.5" />
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
      </button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <Download data-icon="inline-start" className="text-primary" />
      Update tersedia
      <Badge variant="default" className="ml-0.5 h-4 px-1 text-[10px]">
        Baru
      </Badge>
    </Button>
  );
}