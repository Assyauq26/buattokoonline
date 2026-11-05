import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  count,
  size = 14,
  className,
}: {
  value: number;
  count?: number;
  size?: number;
  className?: string;
}) {
  return (
    <div data-theme-role="rating" className={cn("flex items-center gap-1 text-xs text-ink-soft", className)}>
      <Star size={size} className="fill-black text-black" />
      <span className="font-semibold text-ink">{value.toFixed(1)}</span>
      {count != null && <span className="text-ink-muted">({count})</span>}
    </div>
  );
}
