"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Palette, Ruler, Layers3, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canonicalProductForm } from "@/modules/catalog/product-editor-domain";
import { canonicalProductPricing } from "@/modules/catalog/product-canonical-pricing";
import { productInputSchema } from "@/modules/catalog/product-management.validation";
import {
  canonicalOption,
  combinationCount,
} from "@/modules/catalog/variation-domain";
import {
  CustomVariationEditor,
  type VariationEditorHandle,
} from "./custom-variation-editor";

type Editor = ComponentPropsWithoutRef<typeof CustomVariationEditor>;
export function ProductVariationSheet({
  mode,
  groupId,
  editor,
  onCancel,
  onApply,
  onReturnFocus,
  onDirtyChange,
  pointerOpened,
}: {
  mode: "group" | "stock";
  groupId?: string;
  editor: Editor;
  onCancel: () => void;
  onApply: (groups: Editor["groups"], rows: Editor["rows"]) => void;
  onReturnFocus: () => void;
  onDirtyChange: (dirty: boolean) => void;
  pointerOpened: boolean;
}) {
  const [session, setSession] = useState(() => {
    const groups = structuredClone(editor.groups);
    const id = mode === "group" ? groupId || crypto.randomUUID() : undefined;
    if (mode === "group" && !groupId)
      groups.push({
        id: id!,
        name: "",
        allowsImage: false,
        values: [{ id: crypto.randomUUID(), value: "", imageId: null }],
      });
    return { groups, rows: structuredClone(editor.rows), groupId: id };
  });
  const [initial] = useState(() =>
    canonicalProductForm({
      groups: session.groups,
      rows: session.rows,
      photos: editor.optionPhotos,
    }),
  );
  const [busy, setBusy] = useState(false);
  const [bulkDirty, setBulkDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const handle = useRef<VariationEditorHandle>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const changed =
    canonicalProductForm({
      groups: session.groups,
      rows: session.rows,
      photos: editor.optionPhotos,
    }) !== initial || bulkDirty;
  useEffect(() => {
    onDirtyChange(changed || busy);
  }, [changed, busy, onDirtyChange]);
  const original = editor.groups.find((g) => g.id === groupId);
  const title =
    mode === "stock"
      ? "Harga & Stok"
      : groupId
        ? `Edit ${original?.name || "variasi"}`
        : "Tambah variasi";
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    if (!viewport) return;
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
  }, []);
  useEffect(() => {
    if (discard)
      content.current
        ?.querySelector<HTMLButtonElement>("[data-continue-editing]")
        ?.focus();
  }, [discard]);
  function close() {
    if (busy) return;
    if (changed) setDiscard(true);
    else onCancel();
  }
  function showErrors(next: Record<string, string>) {
    setErrors(next);
    setMessage(Object.values(next)[0]);
    requestAnimationFrame(() => {
      const target =
        Object.keys(next)
          .map((id) => document.getElementById(id))
          .find((element) => element !== null) || heading.current;
      target?.closest("details")?.setAttribute("open", "");
      target?.focus();
      target?.scrollIntoView({ block: "center" });
    });
  }
  function save() {
    if (busy || editor.disabled) return;
    if (mode === "group") {
      if (!session.groups.length) {
        onApply([], session.rows);
        return;
      }
      const next: Record<string, string> = {};
      if (session.groups.length > 3)
        next["variation-sheet-title"] = "Maksimal 3 jenis variasi.";
      for (const group of session.groups) {
        if (!group.name.trim() || group.name.trim().length > 80)
          next[`group-title-${group.id}`] =
            "Isi nama variasi, maksimal 80 karakter.";
        else if (
          session.groups.filter(
            (g) => canonicalOption(g.name) === canonicalOption(group.name),
          ).length > 1
        )
          next[`group-title-${group.id}`] =
            "Nama jenis variasi tidak boleh sama.";
        if (!group.values.length)
          next[`group-title-${group.id}`] = "Tambahkan minimal satu opsi.";
        for (const value of group.values) {
          if (!value.value.trim())
            next[`option-value-${value.id}`] = "Isi nama opsi.";
          else if (
            group.values.filter(
              (v) => canonicalOption(v.value) === canonicalOption(value.value),
            ).length > 1
          )
            next[`option-value-${value.id}`] =
              "Nama opsi dalam jenis ini tidak boleh sama.";
        }
      }
      if (combinationCount(session.groups) > 50)
        next["variation-sheet-title"] =
          "Maksimal 50 kombinasi SKU. Kurangi opsi sebelum menyimpan.";
      if (Object.keys(next).length) {
        showErrors(next);
        return;
      }
      setErrors({});
      setMessage("");
      handle.current?.prepare();
      return;
    }
    if (bulkDirty) {
      setMessage(
        "Isian massal belum diterapkan. Tekan Terapkan ke SKU, atau kosongkan perubahan isian massal sebelum menyimpan.",
      );
      return;
    }
    const result = productInputSchema.safeParse(
      canonicalProductPricing({
        name: "Pratinjau produk",
        slug: "pratinjau-produk",
        basePrice: editor.basePrice,
        optionsEnabled: true,
        variantMode: "variable",
        optionGroups: session.groups,
        variants: session.rows,
      }),
    );
    const next: Record<string, string> = {};
    if (!result.success)
      for (const issue of result.error.issues) {
        const [field, index, key] = issue.path;
        const id =
          field === "variants" && typeof index === "number"
            ? key === "sku"
              ? `sku-${index}`
              : `sku-${key === "onHand" ? "stock" : key === "salePrice" ? "sale" : "price"}-${index}`
            : "variation-sheet-title";
        next[id] = /^(Invalid|Too |Expected)/.test(issue.message)
          ? "Periksa isian ini."
          : issue.message;
      }
    session.rows.forEach((row, i) => {
      if (row.onHand !== undefined && row.onHand < (row.reserved ?? 0))
        next[`sku-stock-${i}`] =
          "Stok tidak boleh lebih rendah dari reservasi.";
    });
    if (Object.keys(next).length) {
      showErrors(next);
      return;
    }
    onApply(session.groups, session.rows);
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="seller-editor-overlay variation-sheet-overlay" />
        <Dialog.Content
          ref={content}
          className={`seller-editor-dialog variation-sheet ${mode === "stock" ? "variation-sheet-stock" : "variation-sheet-group"}`}
          data-motion={pointerOpened ? "pointer" : "none"}
          data-input={pointerOpened ? "pointer" : "keyboard"}
          aria-describedby="variation-sheet-help"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
          onPointerDownCapture={() =>
            content.current?.setAttribute("data-input", "pointer")
          }
          onKeyDownCapture={() =>
            content.current?.setAttribute("data-input", "keyboard")
          }
          onEscapeKeyDown={(event) => {
            if (
              content.current?.querySelector(
                '.variation-photo-inline, .sort-handle[aria-pressed="true"]',
              )
            )
              event.preventDefault();
            if (busy || discard) {
              event.preventDefault();
              if (discard) setDiscard(false);
            }
          }}
        >
          <span className="variation-sheet-grip" aria-hidden="true" />
          <header className="variation-sheet-header">
            <Dialog.Title ref={heading} tabIndex={-1}>
              <span id="variation-sheet-title" tabIndex={-1}>
                {title}
                {mode === "stock" ? ` · ${session.rows.length} SKU` : ""}
              </span>
            </Dialog.Title>
            <button
              type="button"
              aria-label="Tutup editor"
              disabled={busy}
              onClick={close}
            >
              <X size={21} />
            </button>
          </header>
          <div className="seller-editor-scroll">
            {message && (
              <p role="alert" className="variation-alert">
                {message}
              </p>
            )}
            <p id="variation-sheet-help" className="variation-sheet-intro">
              {mode === "stock"
                ? `${session.rows.length} kombinasi SKU. Harga kosong mengikuti harga utama. Harga dan stok kombinasi lama tetap dipertahankan.`
                : "Atur nama variasi dan daftar opsi."}
            </p>
            {mode === "group" && !groupId && (
              <div className="variation-sheet-tools">
                {!groupId && (
                  <div
                    className="variation-quick-types"
                    aria-label="Pilihan jenis variasi"
                  >
                    {["Warna", "Ukuran", "Motif", "Lainnya"].map((name) => (
                      <Button
                        key={name}
                        type="button"
                        variant="outline"
                        aria-pressed={
                          session.groups.find((g) => g.id === session.groupId)
                            ?.name === name
                        }
                        disabled={busy || discard}
                        onClick={() => {
                          setSession((s) => ({
                            ...s,
                            groups: s.groups.map((g) =>
                              g.id === s.groupId
                                ? { ...g, name: name === "Lainnya" ? "" : name }
                                : g,
                            ),
                          }));
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`group-title-${session.groupId}`)
                              ?.focus(),
                          );
                        }}
                      >
                        {name === "Warna" ? (
                          <Palette size={14} aria-hidden="true" />
                        ) : name === "Ukuran" ? (
                          <Ruler size={14} aria-hidden="true" />
                        ) : name === "Motif" ? (
                          <Layers3 size={14} aria-hidden="true" />
                        ) : (
                          <Ellipsis size={14} aria-hidden="true" />
                        )}
                        {name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <CustomVariationEditor
              {...editor}
              groups={session.groups}
              rows={session.rows}
              onRemovePhoto={(id) => {
                editor.onRemovePhoto(id);
                setSession((current) => ({
                  ...current,
                  groups: current.groups.map((group) => ({
                    ...group,
                    values: group.values.map((value) =>
                      value.imageId === id
                        ? { ...value, imageId: null }
                        : value,
                    ),
                  })),
                }));
              }}
              groupId={mode === "group" ? session.groupId : undefined}
              mode={mode === "group" ? "groups" : "stock"}
              disabled={editor.disabled || discard}
              handleRef={handle}
              fieldErrors={{ ...editor.fieldErrors, ...errors }}
              onBusy={setBusy}
              onBulkDraftChange={setBulkDirty}
              onChange={(groups, rows) => {
                setSession((s) => ({ ...s, groups, rows }));
                setErrors({});
                setMessage("");
              }}
              onPrepared={(groups, rows) => onApply(groups, rows)}
            />
            {mode === "group" &&
              !session.groups.some((g) => g.id === session.groupId) && (
                <p role="status">
                  Jenis variasi ini akan dihapus dari formulir. Jika ini jenis
                  terakhir, produk kembali tanpa variasi; hanya SKU pertama
                  dipertahankan dan stok tidak digabung.
                </p>
              )}
          </div>
          <footer className="variation-sheet-footer">
            <p role={discard ? "alert" : undefined}>
              {discard
                ? "Buang perubahan pada sheet ini? Draft produk sebelum sheet dibuka tetap dipertahankan."
                : "Belum disimpan permanen. Simpan produk setelah menerapkan perubahan ke formulir."}
            </p>
            <div>
              {discard ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    data-continue-editing
                    onClick={() => setDiscard(false)}
                  >
                    Lanjut mengedit
                  </Button>
                  <Button
                    type="button"
                    className="variation-discard"
                    onClick={onCancel}
                  >
                    Buang perubahan
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="variation-sheet-cancel"
                    disabled={busy}
                    onClick={close}
                  >
                    Batal
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || editor.disabled}
                    onClick={save}
                  >
                    {mode === "stock"
                      ? "Simpan Harga & Stok"
                      : groupId
                        ? `Simpan ${original?.name || "variasi"}`
                        : "Simpan variasi"}
                  </Button>
                </>
              )}
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
