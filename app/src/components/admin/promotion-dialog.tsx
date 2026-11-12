"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
export function PromotionDialog({
  title,
  description,
  onClose,
  children,
  footer,
  kind = "picker",
  onReturnFocus,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  kind?: "picker" | "actions";
  onReturnFocus?: () => void;
}) {
  const [theme] = useState(() => {
    if (typeof document === "undefined") return {};
    const root = document.querySelector(".promo-workspace");
    if (!root) return {};
    const style = getComputedStyle(root);
    return {
      "--promo-primary": style.getPropertyValue("--promo-primary"),
      "--store-primaryText": style.getPropertyValue("--store-primaryText"),
    } as CSSProperties;
  });
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="promo-overlay" />
        <Dialog.Content
          className={
            "promo-dialog" + (kind === "actions" ? " promo-action-dialog" : "")
          }
          style={theme}
          onCloseAutoFocus={(event) => {
            if (onReturnFocus) {
              event.preventDefault();
              onReturnFocus();
            }
          }}
          aria-describedby={
            description ? "promo-dialog-description" : undefined
          }
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const target =
                document.querySelector<HTMLElement>(".promo-dialog input") ??
                document.querySelector<HTMLElement>(
                  ".promo-dialog-body button, .promo-dialog-body a",
                ) ??
                document.querySelector<HTMLElement>(
                  ".promo-dialog > header button",
                );
              target?.focus();
            });
          }}
        >
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="promo-dialog-description">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="promo-icon" aria-label="Tutup">
              <X size={20} />
            </Dialog.Close>
          </header>
          <div className="promo-dialog-body">{children}</div>
          {footer && <footer>{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
