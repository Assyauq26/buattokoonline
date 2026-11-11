"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canonicalProductPricing } from "@/modules/catalog/product-canonical-pricing";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
import {
  CustomVariationEditor,
  type VariationEditorHandle,
} from "./custom-variation-editor";

type EditorProps = ComponentPropsWithoutRef<typeof CustomVariationEditor>;
export function ProductVariationDialog({
  open,
  initialStep,
  editor,
  changed,
  onCancel,
  onReturnFocus,
  onApply,
  onOpenChange,
}: {
  open: boolean;
  initialStep: "groups" | "stock";
  editor: EditorProps;
  changed: boolean;
  onCancel: () => void;
  onReturnFocus: () => void;
  onApply: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [bulkDirty, setBulkDirty] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const handle = useRef<VariationEditorHandle>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setReordering(false);
      setErrors({});
      setMessage("");
      setBulkDirty(false);
    }
  }, [open, initialStep]);
  useEffect(() => {
    if (open) {
      heading.current?.focus({ preventScroll: true });
      const scroll = content.current?.querySelector(".seller-editor-scroll");
      if (scroll) scroll.scrollTop = 0;
    }
  }, [step, open]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const sync = () => {
      content.current?.style.setProperty(
        "--variation-viewport-height",
        viewport.height + "px",
      );
      content.current?.style.setProperty(
        "--variation-viewport-top",
        viewport.offsetTop + "px",
      );
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [open]);
  function close() {
    if (busy || editor.disabled) return;
    if (
      (changed || bulkDirty) &&
      !window.confirm(
        "Buang perubahan variasi sejak editor dibuka? Perubahan yang sudah diterapkan sebelumnya tetap ada pada formulir produk.",
      )
    )
      return;
    onCancel();
    onOpenChange(false);
  }
  function apply() {
    if (busy || editor.disabled) return;
    if (
      bulkDirty &&
      !window.confirm(
        "Isian massal belum diterapkan ke SKU. Lanjutkan tanpa isian massal tersebut?",
      )
    )
      return;
    const result = productInputSchema.safeParse(
      canonicalProductPricing({
        name: editor.productName || "Pratinjau produk",
        slug: "pratinjau-produk",
        basePrice: editor.basePrice,
        optionsEnabled: true,
        variantMode: "variable",
        optionGroups: editor.groups,
        variants: editor.rows,
      }),
    );
    const next: Record<string, string> = {};
    if (!result.success)
      for (const issue of result.error.issues) {
        const [field, index, key, valueIndex] = issue.path;
        let id = "variation-step-title";
        if (field === "variants" && typeof index === "number")
          id =
            key === "sku"
              ? `sku-${index}`
              : `sku-${key === "onHand" ? "stock" : key === "salePrice" ? "sale" : "price"}-${index}`;
        if (field === "optionGroups" && typeof index === "number") {
          const group = editor.groups[index];
          if (group)
            id =
              key === "values" && typeof valueIndex === "number"
                ? `option-value-${group.values[valueIndex]?.id}`
                : `group-title-${group.id}`;
        }
        next[id] = /^(Invalid|Too |Expected)/.test(issue.message)
          ? "Periksa isian variasi ini."
          : issue.message;
      }
    editor.rows.forEach((row, index) => {
      if (row.onHand !== undefined && row.onHand < (row.reserved ?? 0))
        next[`sku-stock-${index}`] =
          "Stok tidak boleh lebih rendah dari jumlah yang direservasi.";
    });
    if (Object.keys(next).length) {
      setErrors(next);
      setMessage(Object.values(next)[0]);
      if (
        Object.keys(next).some(
          (id) => id.startsWith("group-") || id.startsWith("option-"),
        )
      )
        setStep("groups");
      requestAnimationFrame(() => {
        const target = document.getElementById(Object.keys(next)[0]);
        const details = target?.closest("details");
        if (details) details.open = true;
        target?.focus();
        target?.scrollIntoView({ block: "center" });
      });
      return;
    }
    setErrors({});
    onApply();
    onOpenChange(false);
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="seller-editor-overlay two-step-overlay" />
        <Dialog.Content
          ref={content}
          className="seller-editor-dialog two-step-dialog"
          aria-describedby="variation-draft-help"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
          onPointerDownCapture={() => {
            content.current?.setAttribute("data-input", "pointer");
          }}
          onKeyDownCapture={() => {
            content.current?.setAttribute("data-input", "keyboard");
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <header className="two-step-header">
            <button
              type="button"
              aria-label={
                step === "stock"
                  ? "Kembali ke opsi variasi"
                  : "Kembali ke produk"
              }
              disabled={busy}
              onClick={() => (step === "stock" ? setStep("groups") : close())}
            >
              <ArrowLeft size={21} />
            </button>
            <Dialog.Title ref={heading} tabIndex={-1} id="variation-step-title">
              Atur variasi
            </Dialog.Title>
            <span className="two-step-count">
              {step === "groups" ? "1" : "2"} dari 2
            </span>
            <button
              type="button"
              aria-label="Tutup editor variasi"
              disabled={busy}
              onClick={close}
            >
              <X size={21} />
            </button>
          </header>
          <nav
            className="variation-stepper"
            aria-label="Langkah pengaturan variasi"
          >
            <button
              type="button"
              aria-current={step === "groups" ? "step" : undefined}
              disabled={busy}
              onClick={() => setStep("groups")}
            >
              <span>{step === "stock" ? <Check size={16} /> : "1"}</span>Opsi
              variasi
            </button>
            <div aria-current={step === "stock" ? "step" : undefined}>
              <span>2</span>Harga &amp; Stok
            </div>
          </nav>
          <div className="seller-editor-scroll" data-step={step}>
            {message && (
              <p role="alert" className="variation-alert">
                {message}
              </p>
            )}
            {step === "groups" && (
              <div className="variation-step-intro">
                <p>
                  Atur nama dan daftar opsi. Maksimal 3 jenis variasi untuk
                  setiap produk.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={reordering}
                  disabled={busy}
                  onClick={() => setReordering((value) => !value)}
                >
                  {reordering ? "Selesai mengurutkan" : "Urutkan opsi"}
                </Button>
              </div>
            )}
            {step === "stock" && (
              <div className="variation-step-intro">
                <strong>{editor.rows.length} kombinasi SKU</strong>
                <p>
                  Harga, stok, dan kode SKU lama dipertahankan untuk kombinasi
                  yang sama.
                </p>
              </div>
            )}
            <CustomVariationEditor
              {...editor}
              onChange={(groups, rows) => {
                setErrors({});
                setMessage("");
                editor.onChange(groups, rows);
              }}
              handleRef={handle}
              mode={step}
              reordering={reordering}
              fieldErrors={{ ...editor.fieldErrors, ...errors }}
              onBusy={setBusy}
              onBulkDraftChange={setBulkDirty}
              onPrepared={() => {
                setStep("stock");
                setReordering(false);
                setMessage("");
              }}
            />
          </div>
          <footer className="two-step-footer">
            <p id="variation-draft-help">
              Perubahan variasi diterapkan ke formulir. Simpan produk untuk
              menyimpannya permanen.
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => (step === "stock" ? setStep("groups") : close())}
              >
                {step === "stock" ? "Kembali" : "Batal"}
              </Button>
              {step === "groups" ? (
                <Button
                  type="button"
                  disabled={busy || reordering || !editor.productName.trim()}
                  onClick={() => handle.current?.prepare()}
                >
                  {busy ? "Menyiapkan SKU…" : "Lanjut ke Harga & Stok"}
                  <ArrowRight size={17} />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy || editor.disabled}
                  onClick={apply}
                >
                  Simpan variasi
                </Button>
              )}
            </div>
            {step === "groups" && !editor.productName.trim() && (
              <p>Isi nama produk pada Informasi Dasar sebelum membuat SKU.</p>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
