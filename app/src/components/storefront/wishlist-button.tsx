"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleWishlistAction } from "@/modules/wishlist/wishlist.actions";

export function WishlistButton({
  productId,
  initialActive = false,
  className,
}: {
  productId: string;
  initialActive?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState(initialActive);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const previous = active;
    const next = !previous;
    setActive(next);

    start(async () => {
      const res = await toggleWishlistAction(productId);
      if (res.unauthorized) {
        setActive(previous);
        router.push("/login?redirectTo=/wishlist");
        return;
      }
      if (!res.ok) {
        setActive(previous);
        return;
      }
      if (res.data) setActive(res.data.active);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={active ? "Hapus dari wishlist" : "Tambah ke wishlist"}
      aria-pressed={active}
      data-testid={`wishlist-toggle-${productId}`}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-transform hover:scale-110 active:scale-95",
        className,
      )}
    >
      <Heart
        size={18}
        className={cn(active ? "fill-black text-black" : "text-ink-soft")}
      />
    </button>
  );
}
