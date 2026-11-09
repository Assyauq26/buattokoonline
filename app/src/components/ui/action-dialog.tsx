"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type RefObject,
} from "react";
import { X, LoaderCircle } from "lucide-react";

export function ActionDialog({
  open,
  onClose,
  title,
  description,
  children,
  primary = "Lanjutkan",
  onConfirm,
  busy = false,
  confirmDisabled = false,
  error,
  sourceRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  primary?: string;
  onConfirm: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string;
  sourceRef?: RefObject<HTMLElement>;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    if (open && sourceRef?.current) {
      const computed = getComputedStyle(sourceRef.current),
        vars: Record<string, string> = {};
      for (const k of Array.from(computed))
        if (k.startsWith("--store-") || k.startsWith("--ui-"))
          vars[k] = computed.getPropertyValue(k);
      setStyle(vars);
    }
  }, [open, sourceRef]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="action-overlay" />
        <Dialog.Content
          className="action-dialog"
          style={style}
          onOpenAutoFocus={() => {
            trigger.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(e) => {
            if (trigger.current?.isConnected) {
              e.preventDefault();
              trigger.current.focus();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label="Tutup" disabled={busy}>
              <X size={22} />
            </Dialog.Close>
          </header>
          <Dialog.Description>
            {description || "Periksa rincian sebelum melanjutkan."}
          </Dialog.Description>
          {children}
          {error && (
            <p role="alert" className="action-error">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="action-secondary"
              disabled={busy}
              onClick={onClose}
            >
              Kembali
            </button>
            <button
              type="button"
              className="action-primary"
              disabled={busy || confirmDisabled}
              onClick={onConfirm}
            >
              {busy && <LoaderCircle size={18} className="animate-spin" />}
              {busy ? "Memproses…" : primary}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Defers an existing validated submit/click; business handlers stay authoritative. */
export function ConfirmActions({
  children,
  busy,
  error,
}: {
  children: ReactNode;
  busy: boolean;
  error?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    bypass = useRef<HTMLElement | null>(null),
    pending = useRef<() => void>(),
    wasBusy = useRef(false);
  const [review, setReview] = useState<{
    title: string;
    description: string;
    label: string;
  } | null>(null);
  useEffect(() => {
    if (wasBusy.current && !busy && !error) setReview(null);
    wasBusy.current = busy;
  }, [busy, error]);
  function capture(
    target: HTMLElement,
    run: () => void,
    e: { preventDefault: () => void; stopPropagation: () => void },
  ) {
    if (bypass.current === target) {
      bypass.current = null;
      return;
    }
    if (
      target.closest("[data-confirm-boundary]") !== root.current ||
      !target.dataset.confirmTitle
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    pending.current = () => {
      bypass.current = target;
      try {
        run();
      } finally {
        bypass.current = null;
      }
    };
    setReview({
      title: target.dataset.confirmTitle,
      description:
        target.dataset.confirmDescription ||
        "Periksa dampak tindakan ini sebelum melanjutkan.",
      label: target.dataset.confirmLabel || "Konfirmasi",
    });
  }
  return (
    <div
      ref={root}
      data-confirm-boundary
      onSubmitCapture={(e) => {
        const form = e.target as HTMLFormElement;
        const submitter = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        capture(form, () => form.requestSubmit(submitter), e);
      }}
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "button[data-confirm-title]",
        );
        if (button) capture(button, () => button.click(), e);
      }}
    >
      {children}
      <ActionDialog
        open={!!review}
        sourceRef={root}
        onClose={() => setReview(null)}
        title={review?.title || "Konfirmasi"}
        description={review?.description}
        primary={review?.label}
        onConfirm={() => {
          if (!busy) pending.current?.();
        }}
        busy={busy}
        error={error}
      />
    </div>
  );
}
