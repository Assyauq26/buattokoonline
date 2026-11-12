"use client";
import { useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { PromotionDialog } from "./promotion-dialog";
export function PromotionRowActions({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="promo-desktop promo-actions">{children}</div>
      <button
        ref={trigger}
        className="promo-mobile promo-more"
        aria-label={"Tindakan " + label}
        onClick={() => setOpen(true)}
      >
        <Ellipsis size={20} />
      </button>
      {open && (
        <PromotionDialog
          title={label}
          kind="actions"
          onClose={() => setOpen(false)}
          onReturnFocus={() => trigger.current?.focus()}
        >
          <div
            className="promo-menu-actions"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a,button")) setOpen(false);
            }}
          >
            {children}
          </div>
        </PromotionDialog>
      )}
    </>
  );
}
