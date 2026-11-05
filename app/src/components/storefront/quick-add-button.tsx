"use client";
import { ShoppingBag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartInteraction } from "./cart-interaction-provider";
export function QuickAddButton({
  slug,
  testId,
  disabled,
  className,
}: {
  slug: string;
  testId: string;
  disabled?: boolean;
  className?: string;
}) {
  const interaction = useCartInteraction();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        interaction?.openProduct(slug, e.currentTarget);
      }}
      disabled={disabled || interaction?.busy || !interaction}
      aria-label="Tambah ke keranjang"
      aria-busy={interaction?.busy ?? false}
      data-testid={`quick-add-${testId}`}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent text-ink shadow-none transition-transform hover:scale-105 active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {interaction?.busy ? (
        <Loader2
          size={21}
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <ShoppingBag size={21} strokeWidth={2} />
      )}
    </button>
  );
}
