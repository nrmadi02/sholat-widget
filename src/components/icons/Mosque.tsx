import { faMosque } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@/lib/utils";

export function MosqueIcon({ className }: { className?: string }) {
  return (
    <FontAwesomeIcon
      icon={faMosque}
      aria-hidden
      className={cn("size-4", className)}
    />
  );
}
