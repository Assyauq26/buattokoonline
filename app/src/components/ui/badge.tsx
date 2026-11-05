import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "sale" | "muted" | "success" | "warning" | "info" | "destructive" | "outline";
}) {
  const styles: Record<string, string> = {
    default: "bg-black text-white",
    sale: "bg-black text-white",
    muted: "bg-surface text-ink-soft",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
    destructive: "bg-red-100 text-red-700",
    outline: "border border-line text-ink-soft",
  };
  return (
    <span
      data-badge-variant={variant}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
