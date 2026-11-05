"use client";
import { allocateProductSkusAction } from "@/modules/catalog/product-management.actions";
import { reorderById, SortableHandle } from "./sortable-handle";
import { ProductBulkEditor } from "./product-bulk-editor";
import { suggestSku } from "@/modules/catalog/product-editor-domain";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus,
  Trash2,
  Camera,
  Layers3,
  ChevronDown,
  ChevronRight,
  X,
  Ellipsis,
  ImageIcon,
  Check,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canonicalOption,
  combinationCount,
  combinationKey,
  generateCombinations,
  optionLabel,
  type OptionGroup,
} from "@/modules/catalog/variation-domain";
import type { ProductInput } from "@/modules/catalog/product-management.validation";

type Row = ProductInput["variants"][number] & {
  reserved?: number;
  protected?: boolean;
};
type Photo = { id: string; url: string; alt: string; recovered?: boolean };
type Props = {
  mode?: "all" | "groups" | "stock";
  reordering?: boolean;
  groups: OptionGroup[];
  rows: Row[];
  photos: Photo[];
  galleryPhotos?: Photo[];
  optionPhotos: Photo[];
  canUndoPhotos: boolean;
  onRemovePhoto: (id: string) => void;
  onUndoPhotos: () => void;
  disabled: boolean;
  canStock: boolean;
  productName: string;
  basePrice: number;
  onChange: (groups: OptionGroup[], rows: Row[]) => void;
  onUpload: (
    file: File,
    progress: (percent: number) => void,
  ) => Promise<Photo | undefined>;
};
export function CustomVariationEditor(p: Props) {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [picker, setPicker] = useState<{ groupId: string; valueId: string; photoId: string | null } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(new Set<number>());
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [error, setError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirm: string;
    run: () => void;
  } | null>(null);
  const [upload, setUpload] = useState<{
    id: string;
    progress: number;
    preview: string;
  } | null>(null);
  useEffect(
    () => () => {
      if (upload?.preview) URL.revokeObjectURL(upload.preview);
    },
    [upload?.preview],
  );
  const retry = useRef<{ id: string; file: File } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusAfterConfirm = useRef(false);
  const identities = p.rows
    .map((row) => row.id || combinationKey(row.optionValueIds ?? []))
    .join(";");
  useEffect(() => {
    setSelected(new Set());
  }, [identities]);
  const count = combinationCount(p.groups);
  const blocked = p.disabled || upload !== null || generating;
  function change(groups: OptionGroup[], rows = p.rows) {
    setError("");
    setUploadNotice("");
    p.onChange(groups, rows);
  }
  function groupChange(id: string, patch: Partial<OptionGroup>) {
    change(p.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function valueChange(
    groupId: string,
    valueId: string,
    patch: Partial<OptionGroup["values"][number]>,
  ) {
    change(
      p.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              values: g.values.map((v) =>
                v.id === valueId ? { ...v, ...patch } : v,
              ),
            }
          : g,
      ),
    );
  }
  function removeValue(groupId: string, valueId: string) {
    if (
      p.rows.some(
        (row) => row.protected && row.optionValueIds?.includes(valueId),
      )
    ) {
      setError(
        "Opsi ini dipakai SKU dengan stok atau riwayat. Pertahankan opsi tersebut; nama dan foto tetap dapat diubah.",
      );
      return;
    }
    setConfirmation({
      title: "Hapus opsi?",
      description:
        "Kombinasi yang memakai opsi ini perlu ditinjau kembali. Foto historis tetap dilindungi server.",
      confirm: "Hapus opsi",
      run: () =>
        groupChange(groupId, {
          values: p.groups
            .find((g) => g.id === groupId)!
            .values.filter((v) => v.id !== valueId),
        }),
    });
  }
  function imageMode(group: OptionGroup, checked: boolean) {
    const previous = p.groups.find((g) => g.allowsImage && g.id !== group.id);
    const apply = () =>
      change(
        p.groups.map((g) => ({
          ...g,
          allowsImage: g.id === group.id ? checked : false,
          values: g.values.map((v) => ({
            ...v,
            imageId: g.id === group.id && checked ? v.imageId : null,
          })),
        })),
      );
    if (checked && previous)
      setConfirmation({
        title: "Pindahkan foto variasi?",
        description: `Foto variasi hanya dapat digunakan pada satu jenis variasi. Foto saat ini digunakan pada ${previous.name}. Memindahkan fitur gambar ke ${group.name} akan melepaskan hubungan foto dari pilihan sebelumnya.`,
        confirm: "Pindahkan",
        run: apply,
      });
    else if (!checked && group.values.some((v) => v.imageId))
      setConfirmation({
        title: "Nonaktifkan foto variasi?",
        description:
          "Mapping foto akan dilepas. Objek historis tidak dihapus secara otomatis; server menjaga referensi pesanan.",
        confirm: "Nonaktifkan",
        run: apply,
      });
    else apply();
  }
  async function send(groupId: string, valueId: string, file: File) {
    if (blocked) return;
    retry.current = { id: valueId, file };
    setUploadNotice("");
    setUpload({ id: valueId, progress: 0, preview: URL.createObjectURL(file) });
    setError("");
    try {
      const image = await p.onUpload(file, (progress) =>
        setUpload((current) => (current ? { ...current, progress } : current)),
      );
      if (image) {
        setPicker((current) => current?.valueId === valueId ? { ...current, photoId: image.id } : current);
        valueChange(groupId, valueId, { imageId: image.id });
        setUploadNotice(
          image.recovered
            ? "Hasil upload dipulihkan. Klik Simpan untuk memasang foto."
            : "Foto sementara siap. Klik Simpan untuk memasang foto.",
        );
        retry.current = null;
      } else
        setError(
          "Foto gagal diunggah. Data variasi tetap tersimpan dalam editor; coba lagi.",
        );
    } catch {
      setError("Upload gagal. Periksa koneksi dan coba lagi.");
    } finally {
      setUpload(null);
    }
  }
  function generate() {
    if (count > 50) {
      setError(
        "Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi beberapa opsi untuk melanjutkan.",
      );
      return;
    }
    if (
      !p.groups.length ||
      p.groups.some(
        (g) =>
          !g.name.trim() ||
          !g.values.length ||
          g.values.some((v) => !v.value.trim()),
      )
    ) {
      setError(
        "Lengkapi nama variasi dan minimal satu opsi sebelum membuat SKU.",
      );
      root.current?.querySelector<HTMLInputElement>("input:invalid")?.focus();
      return;
    }
    if (
      new Set(p.groups.map((g) => canonicalOption(g.name))).size !==
        p.groups.length ||
      p.groups.some(
        (g) =>
          new Set(g.values.map((v) => canonicalOption(v.value))).size !==
          g.values.length,
      )
    ) {
      setError(
        "Nama variasi dan nilai opsi dalam satu grup tidak boleh duplikat.",
      );
      return;
    }
    const combinations = generateCombinations(p.groups),
      keys = new Set(combinations.map(combinationKey));
    const existing = new Map(
      p.rows.map((row) => [combinationKey(row.optionValueIds ?? []), row]),
    );
    const removed = p.rows.filter(
      (row) => !keys.has(combinationKey(row.optionValueIds ?? [])),
    );
    if (removed.some((row) => row.protected)) {
      setError(
        "Pembentukan ini mengubah identitas SKU dengan stok/riwayat. Pertahankan opsi lama atau gunakan produk baru untuk jenis variasi baru.",
      );
      return;
    }
    const apply = async () => {
      setGenerating(true);
      try {
        const used = new Set(p.rows.map((row) => row.sku.toUpperCase()));
        const rows = combinations.map((ids) => {
          const old = existing.get(combinationKey(ids));
          if (old) return old;
          const sku = suggestSku(p.productName, p.groups, ids, used);
          used.add(sku.toUpperCase());
          return {
            sku,
            color: "",
            size: "",
            price: null,
            salePrice: null,
            ...(p.canStock ? { onHand: 0 } : {}),
            optionValueIds: ids,
          };
        });
        const fresh = rows.filter(
          (row) => !existing.has(combinationKey(row.optionValueIds ?? [])),
        );
        if (fresh.length) {
          const result = await allocateProductSkusAction(
            fresh.map((row) => ({
              key: combinationKey(row.optionValueIds ?? []),
              sku: row.sku,
            })),
          );
          if (!result.ok || !result.data)
            throw new Error(result.error || "SKU gagal dibuat.");
          for (const row of fresh)
            row.sku = result.data.find(
              (candidate) =>
                candidate.key === combinationKey(row.optionValueIds ?? []),
            )!.sku;
        }
        setSelected(new Set());
        change(p.groups, rows);
      } catch (error) {
        setError(error instanceof Error ? error.message : "SKU gagal dibuat.");
      } finally {
        setGenerating(false);
      }
    };
    if (removed.some((row) => row.id || row.sku || row.price || row.onHand))
      setConfirmation({
        title: "Review pembentukan SKU",
        description: `${removed.length} SKU yang tidak sesuai kombinasi baru akan dilepas dari draft. Harga dan stok untuk kombinasi yang tetap sama dipertahankan. Server menolak penghapusan SKU bersejarah.`,
        confirm: "Buat kombinasi",
        run: apply,
      });
    else apply();
  }
  function rowChange(index: number, patch: Partial<Row>) {
    change(
      p.groups,
      p.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }
  return (
    <div
      className="variation-editor"
      ref={root}
      data-testid="custom-variation-editor"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
    >
      {p.mode !== "stock" && (<>
      <div className="variation-heading">
        <div>
          <h2>Variasi Produk</h2>
          <p>Atur pilihan pelanggan, lalu buat SKU untuk setiap kombinasi.</p>
        </div>
        <Layers3 aria-hidden="true" size={24} />
      </div>
      {error && (
        <div role="alert" className="variation-alert" tabIndex={-1}>
          {error}
        </div>
      )}
      {uploadNotice && <p role="status">{uploadNotice}</p>}
      {!p.groups.length && (
        <div className="variation-empty">
          <Layers3 size={28} aria-hidden="true" />
          <h3>Satu produk, banyak pilihan</h3>
          <p>
            Tambahkan variasi seperti Warna, Model, Motif atau Kapasitas. Setiap
            pilihan akan terhubung ke SKU yang tepat.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() =>
              change([
                {
                  id: crypto.randomUUID(),
                  name: "",
                  allowsImage: false,
                  values: [
                    { id: crypto.randomUUID(), value: "", imageId: null },
                  ],
                },
              ])
            }
          >
            <Plus size={18} /> Tambah variasi pertama
          </Button>
        </div>
      )}
      {p.reordering && <p className="variation-sort-hint" role="status">Tekan dan geser untuk mengurutkan. Gunakan handle grup atau opsi.</p>}
      <div className="variation-groups">
        {p.groups.map((group, index) => (
          <details
            open={!collapsed.has(group.id)}
            onInvalidCapture={() => setCollapsed(current => { const next = new Set(current); next.delete(group.id); return next; })}
            className="variation-card"
            data-sort-scope="variation-groups" data-sort-id={group.id}
            key={group.id}
            aria-labelledby={`group-summary-${group.id}`}
          >
            <summary id={`group-summary-${group.id}`} className="variation-group-summary" aria-expanded={!collapsed.has(group.id)} onClick={event => {
              event.preventDefault(); setCollapsed(current => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; });
            }}>
              {p.reordering && <SortableHandle scope="variation-groups" id={group.id} label={`variasi ${index + 1}`} disabled={blocked} onMove={(from, to) => p.onChange(reorderById(p.groups, from, to), p.rows)} />}
              <span className="variation-summary-name">{group.name || `Variasi ${index + 1}`}</span>
              <span className="variation-summary-count">{group.values.length} opsi{group.allowsImage ? " · Gambar aktif" : ""}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <header className="variation-card-header">
              <div className="variation-field">
                <label htmlFor={`group-title-${group.id}`}>
                  Nama variasi <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`group-title-${group.id}`}
                  aria-label={`Nama variasi ${index + 1}`}
                  required
                  maxLength={80}
                  value={group.name}
                  aria-invalid={
                    !!group.name &&
                    p.groups.filter(
                      (g) =>
                        canonicalOption(g.name) === canonicalOption(group.name),
                    ).length > 1
                  }
                  disabled={blocked || p.reordering}
                  placeholder="Contoh: Warna, Model, Motif, Kapasitas"
                  onChange={(e) =>
                    groupChange(group.id, { name: e.target.value })
                  }
                />
              </div>
              <details className="variation-tools" open={p.reordering ? true : undefined}>
              <summary aria-label={`Aksi variasi ${index + 1}`}><Ellipsis size={17} aria-hidden="true" /></summary>
              <div className="variation-tools-menu">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus variasi ${index + 1}`}
                  disabled={blocked}
                  onClick={() => {
                    if (p.rows.some((v) => v.protected)) {
                      setError(
                        "Jenis variasi SKU berstok/bersejarah tidak dapat dihapus.",
                      );
                      return;
                    }
                    setConfirmation({
                      title: "Hapus jenis variasi?",
                      description:
                        "Daftar SKU perlu dibuat ulang. Perubahan belum disimpan sampai Anda menyimpan produk.",
                      confirm: "Hapus variasi",
                      run: () =>
                        change(p.groups.filter((g) => g.id !== group.id)),
                    });
                  }}
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            </details>
            <label className="variation-image-switch">
              <span>
                <strong>Tambahkan gambar</strong>
                <small>Foto dapat diaktifkan pada satu jenis variasi.</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Tambahkan gambar ${group.name || `variasi ${index + 1}`}`}
                checked={group.allowsImage}
                disabled={blocked}
                onChange={(e) => imageMode(group, e.target.checked)}
              />
            </label>
            </header>
            <div className="variation-values">
              {group.values.map((value, vi) => {
                const image = p.photos.find(
                  (image) => image.id === value.imageId,
                );
                return (
                  <div
                    key={value.id}
                    data-sort-scope={`variation-options-${group.id}`} data-sort-id={value.id}
                    className={`variation-value-row ${group.allowsImage ? "with-image" : ""}`}
                  >
                    <div className="variation-reorder">
                      <SortableHandle scope={`variation-options-${group.id}`} id={value.id} label={`opsi ${value.value || vi + 1}`} disabled={blocked || !p.reordering} onMove={(from, to) => p.onChange(p.groups.map(g => g.id === group.id ? { ...g, values: reorderById(g.values, from, to) } : g), p.rows)} />
                    </div>
                    {group.allowsImage && (
                      <div className="variation-photo">
                        <button
                          type="button"
                          className="variation-photo-picker"
                          aria-label={`${image ? "Ganti" : "Unggah"} foto ${value.value || `opsi ${vi + 1}`}`}
                          disabled={blocked}
                          onClick={() => setPicker({ groupId: group.id, valueId: value.id, photoId: value.imageId ?? null })}
                        >
                          {image || upload?.id === value.id ? (
                            <Image
                              unoptimized
                              src={image?.url || upload!.preview}
                              alt={image?.alt || value.value}
                              width={56}
                              height={56}
                            />
                          ) : (
                            <Camera size={21} aria-hidden="true" />
                          )}
                        </button>
                        <input
                          type="file"
                          tabIndex={-1}
                          className="sr-only"
                          aria-label={`File foto ${value.value || vi + 1}`}
                          data-upload-id={value.id}
                          accept="image/jpeg,image/png,image/webp"
                          disabled={blocked}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void send(group.id, value.id, file);
                            e.target.value = "";
                          }}
                        />
                        {image && (
                          <button
                            type="button"
                            aria-label={`Lepaskan foto ${value.value}`}
                            disabled={blocked}
                            onClick={() =>
                              valueChange(group.id, value.id, { imageId: null })
                            }
                          >
                            Lepas
                          </button>
                        )}
                      </div>
                    )}
                    <div className="variation-field">
                      <label htmlFor={`option-value-${value.id}`}>
                        Opsi {vi + 1} <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id={`option-value-${value.id}`}
                        aria-label={`Opsi ${group.name || index + 1} ${vi + 1}`}
                        maxLength={80}
                        required
                        value={value.value}
                        aria-invalid={
                          !!value.value &&
                          group.values.filter(
                            (v) =>
                              canonicalOption(v.value) ===
                              canonicalOption(value.value),
                          ).length > 1
                        }
                        placeholder="Nama pilihan"
                        disabled={blocked || p.reordering}
                        onChange={(e) =>
                          valueChange(group.id, value.id, {
                            value: e.target.value,
                          })
                        }
                      />
                      {upload?.id === value.id && (
                        <span role="status">
                          Mengunggah {upload.progress}%
                          <progress value={upload.progress} max={100} />
                        </span>
                      )}
                      {retry.current?.id === value.id && upload === null && (
                        <button
                          type="button"
                          className="variation-link"
                          disabled={blocked}
                          onClick={() =>
                            void send(group.id, value.id, retry.current!.file)
                          }
                        >
                          Coba unggah lagi
                        </button>
                      )}
                    </div>
                    {group.allowsImage && (
                      <button
                        type="button"
                        className="variation-photo-select variation-select-button"
                        disabled={blocked}
                        aria-label={`Pilih gambar variasi untuk ${value.value || `opsi ${vi + 1}`}`}
                        onClick={() => setPicker({ groupId: group.id, valueId: value.id, photoId: value.imageId ?? null })}
                      >
                        <ImageIcon size={16} aria-hidden="true" />
                        <span>{image ? `Foto ${p.photos.findIndex((photo) => photo.id === image.id) + 1}: ${image.alt || "Produk"}` : "Pilih gambar (opsional)"}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Hapus opsi ${value.value || vi + 1}`}
                      disabled={blocked}
                      onClick={() => removeValue(group.id, value.id)}
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <footer className="variation-card-footer">
              <Button
                type="button"
                variant="ghost"
                disabled={blocked || group.values.length >= 50}
                onClick={() =>
                  groupChange(group.id, {
                    values: [
                      ...group.values,
                      { id: crypto.randomUUID(), value: "", imageId: null },
                    ],
                  })
                }
              >
                <Plus size={17} /> Tambahkan opsi
              </Button>
              <span className="variation-option-count">{group.values.length} / 50 opsi</span>
            </footer>
          </details>
        ))}
      </div>
      {p.groups.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="variation-add-group"
          disabled={blocked || p.groups.length >= 3}
          onClick={() =>
            change([
              ...p.groups,
              {
                id: crypto.randomUUID(),
                name: "",
                allowsImage: false,
                values: [{ id: crypto.randomUUID(), value: "", imageId: null }],
              },
            ])
          }
        >
          <Plus size={18} /> Tambah variasi <span>({p.groups.length}/3)</span>
        </Button>
      )}
      {(p.optionPhotos.length > 0 || p.canUndoPhotos) && (
        <details className="variation-media-library">
          <summary><ImageIcon size={16} aria-hidden="true" /> Foto variasi tersimpan ({p.optionPhotos.length}) <ChevronRight size={16} aria-hidden="true" /></summary>
          <p>
            Melepas foto dari opsi tidak menghapus file. Penghapusan permanen
            harus dikonfirmasi; foto pesanan historis tetap dilindungi server.
          </p>
          <div className="variation-media-list">
            {p.optionPhotos.map((photo, pi) => {
              const used = p.groups.some((g) =>
                g.values.some((v) => v.imageId === photo.id),
              );
              return (
                <div key={photo.id}>
                  <Image
                    unoptimized
                    src={photo.url}
                    width={56}
                    height={56}
                    alt={photo.alt || `Foto tersimpan ${pi + 1}`}
                  />
                  <span>
                    Foto {pi + 1}
                    {used ? " · dipakai" : " · belum dipakai"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={blocked || used}
                    aria-label={`Hapus permanen foto tersimpan ${pi + 1}`}
                    onClick={() =>
                      setConfirmation({
                        title: "Hapus foto tersimpan?",
                        description:
                          "File akan dihapus setelah produk disimpan. Server menolak penghapusan foto yang dipakai riwayat pesanan. Perubahan lain tetap berada di editor.",
                        confirm: "Hapus foto",
                        run: () => p.onRemovePhoto(photo.id),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={blocked || !p.canUndoPhotos}
            onClick={p.onUndoPhotos}
          >
            Pulihkan penghapusan foto yang belum disimpan
          </Button>
        </details>
      )}
      </>)}
      {p.mode !== "groups" && (<>
      <ProductBulkEditor
        rows={p.rows}
        basePrice={p.basePrice}
        canStock={p.canStock}
        disabled={blocked}
        selected={selected}
        selectedOnly={selectedOnly}
        onMode={setSelectedOnly}
        onChange={(rows) => change(p.groups, rows)}
      />
      {p.groups.length > 0 && (
        <section className="variation-review">
          <div>
            <h3>Kombinasi SKU</h3>
            <p aria-live="polite">
              {count > 50 ? "Lebih dari 50" : count} kombinasi akan dibuat.
              Harga dan stok lama dipertahankan untuk kombinasi yang sama.
            </p>
            {p.productName.trim() &&
              count > 0 &&
              count <= 50 &&
              p.groups.every(
                (group) =>
                  group.name.trim() &&
                  group.values.every((value) => value.value.trim()),
              ) && (
                <p>
                  Pratinjau SKU baru:{" "}
                  <strong>
                    {suggestSku(
                      p.productName,
                      p.groups,
                      generateCombinations(p.groups)[0],
                    )}
                  </strong>
                  . SKU existing tetap dipertahankan.
                </p>
              )}
            {count > 50 && (
              <p role="alert" className="variation-error">
                Jumlah kombinasi melebihi batas maksimum 50 SKU. Kurangi
                beberapa opsi untuk melanjutkan.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={blocked || !count || count > 50 || !p.productName.trim()}
            onClick={generate}
          >
            Buat {count > 50 ? "" : count} kombinasi
          </Button>
        </section>
      )}
      <section className="variation-skus" aria-label="Harga dan stok SKU">
        <div className="variation-section-title">
          <h3>Harga &amp; Stok</h3>
          <span>{p.rows.filter((r) => r.sku).length} / {p.rows.length} SKU</span>
        </div>
        <p>
          {p.basePrice > 0
            ? `Harga kosong mengikuti harga tersimpan Rp${p.basePrice.toLocaleString("id-ID")}.`
            : "Isi harga normal setiap kombinasi melalui Input Massal atau masing-masing SKU."}
          {" "}Stok diubah hanya oleh operator berizin.
        </p>
        {p.rows.map((row, index) => (
          <details
            key={
              row.id || combinationKey(row.optionValueIds ?? []) || "default"
            }
            open={index === 0}
            className="variation-sku"
            onInvalidCapture={(e) => {
              e.currentTarget.open = true;
            }}
          >
            <summary>
              {selectedOnly && (
                <input
                  type="checkbox"
                  aria-label={`Pilih SKU ${index + 1}`}
                  checked={selected.has(index)}
                  disabled={blocked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(index);
                      else next.delete(index);
                      return next;
                    })
                  }
                />
              )}
              {(() => {
                const imageId = p.groups
                  .find((g) => g.allowsImage)
                  ?.values.find((v) =>
                    row.optionValueIds?.includes(v.id),
                  )?.imageId;
                const image = p.photos.find((photo) => photo.id === imageId);
                return image ? (
                  <Image
                    unoptimized
                    src={image.url}
                    alt=""
                    width={40}
                    height={40}
                    className="variation-sku-photo"
                  />
                ) : null;
              })()}
              <span>
                {optionLabel(p.groups, row.optionValueIds ?? []) || "SKU dasar"}
                <small>{row.sku || "Buat kombinasi atau isi SKU"}</small>
              </span>
              <span className="variation-pill">
                {row.protected ? "Dilindungi" : "SKU"}
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="variation-sku-fields">
              <div className="variation-field">
                <label htmlFor={`sku-${index}`}>
                  SKU <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`sku-${index}`}
                  aria-label={`SKU kombinasi ${index + 1}`}
                  required
                  maxLength={80}
                  value={row.sku}
                  disabled={blocked}
                  onChange={(e) => rowChange(index, { sku: e.target.value })}
                />
              </div>
              <div className="variation-field">
                <label htmlFor={`sku-price-${index}`}>Harga (Rp)</label>
                <input
                  id={`sku-price-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  max={2147483647}
                  value={row.price ?? ""}
                  placeholder="Ikuti harga utama"
                  disabled={blocked}
                  onChange={(e) =>
                    rowChange(index, {
                      price: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="variation-field">
                <label htmlFor={`sku-sale-${index}`}>Harga diskon (Rp)</label>
                <input
                  id={`sku-sale-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  max={(row.price ?? p.basePrice) - 1}
                  value={row.salePrice ?? ""}
                  placeholder="Opsional"
                  disabled={blocked}
                  onChange={(e) =>
                    rowChange(index, {
                      salePrice: e.target.value ? Number(e.target.value) : null,
                      ...(e.target.value && row.price == null
                        ? { price: p.basePrice }
                        : {}),
                    })
                  }
                />
              </div>
              {row.onHand !== undefined && (
                <div className="variation-field">
                  <label htmlFor={`sku-stock-${index}`}>Stok fisik</label>
                  <input
                    id={`sku-stock-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={row.reserved ?? 0}
                    step={1}
                    max={2147483647}
                    value={row.onHand}
                    disabled={blocked || !p.canStock}
                    onChange={(e) =>
                      rowChange(index, { onHand: Number(e.target.value) })
                    }
                  />
                  <small>
                    {row.reserved ?? 0} direservasi ·{" "}
                    {Math.max(0, row.onHand - (row.reserved ?? 0))} tersedia
                  </small>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                className="variation-remove-sku"
                disabled={blocked || p.rows.length <= 1 || row.protected}
                onClick={() =>
                  setConfirmation({
                    title: "Hapus SKU?",
                    description:
                      "Kombinasi ini tidak lagi tersedia untuk pembelian. Server tetap memeriksa stok dan referensi sebelum menghapus.",
                    confirm: "Hapus SKU",
                    run: () =>
                      change(
                        p.groups,
                        p.rows.filter((_, i) => i !== index),
                      ),
                  })
                }
              >
                <Trash2 size={16} /> Hapus SKU
              </Button>
            </div>
          </details>
        ))}
      </section>
      </>)}
      <Dialog.Root
        open={picker !== null}
        onOpenChange={(open) => { if (!open) setPicker(null); }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="seller-image-overlay" />
          <Dialog.Content className="seller-image-dialog" aria-describedby="seller-picker-desc">
            <span className="seller-sheet-handle" aria-hidden="true" />
            <header className="seller-image-dialog-header">
              <div>
                <Dialog.Title>Pilih gambar variasi</Dialog.Title>
                <Dialog.Description id="seller-picker-desc">Pilih dari foto produk utama atau unggah gambar baru.</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="Tutup pilih gambar"><X size={22} /></button>
              </Dialog.Close>
            </header>
            <strong className="seller-photo-group-title">Foto produk utama</strong>
            <div className="seller-photo-grid">
              {(p.galleryPhotos ?? p.photos).map((photo, index) => (
                <button
                  type="button"
                  key={photo.id}
                  className={`seller-photo-tile ${picker?.photoId === photo.id ? "selected" : ""}`}
                  onClick={() => setPicker((current) => current ? { ...current, photoId: photo.id } : current)}
                  aria-label={`Pilih foto ${index + 1}`}
                  aria-pressed={picker?.photoId === photo.id}
                >
                  <Image unoptimized src={photo.url} alt={photo.alt || `Foto ${index + 1}`} width={160} height={160} />
                  {picker?.photoId === photo.id && <Check size={18} className="seller-photo-check" aria-hidden="true" />}
                </button>
              ))}
              <button
                type="button"
                disabled={blocked}
                className="seller-photo-upload"
                onClick={() => {
                  if (!picker) return;
                  root.current?.querySelector<HTMLInputElement>(`[data-upload-id="${picker.valueId}"]`)?.click();
                }}
              >
                <Plus size={27} aria-hidden="true" /><span>Unggah baru</span>
              </button>
            </div>
            {p.optionPhotos.length > 0 && (
              <>
                <strong className="seller-photo-group-title">Foto variasi tersimpan</strong>
                <div className="seller-photo-grid">
                  {p.optionPhotos.map((photo, index) => (
                    <button type="button" key={photo.id} className={`seller-photo-tile ${picker?.photoId === photo.id ? "selected" : ""}`} onClick={() => setPicker((current) => current ? { ...current, photoId: photo.id } : current)} aria-label={`Pilih foto variasi ${index + 1}`} aria-pressed={picker?.photoId === photo.id}>
                      <Image unoptimized src={photo.url} alt={photo.alt || `Foto variasi ${index + 1}`} width={160} height={160} />
                      {picker?.photoId === photo.id && <Check size={18} className="seller-photo-check" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="seller-photo-helper"><ImagePlus size={15} aria-hidden="true" /> Gambar yang dipilih akan digunakan untuk opsi variasi ini.</p>
            <footer className="seller-image-actions">
              <button type="button" onClick={() => setPicker(null)}>Batal</button>
              <button type="button" disabled={!picker?.photoId || blocked} onClick={() => {
                if (!picker?.photoId) return;
                valueChange(picker.groupId, picker.valueId, { imageId: picker.photoId });
                setPicker(null);
              }}>Gunakan gambar</button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="variation-overlay" />
          <Dialog.Content
            onCloseAutoFocus={(event) => {
              if (focusAfterConfirm.current) {
                event.preventDefault();
                focusAfterConfirm.current = false;
                requestAnimationFrame(() =>
                  root.current
                    ?.querySelector<HTMLElement>(
                      "input:not(:disabled),button:not(:disabled)",
                    )
                    ?.focus(),
                );
              }
            }}
            className="variation-confirm"
            aria-describedby="variation-confirm-description"
          >
            <Dialog.Title>{confirmation?.title}</Dialog.Title>
            <Dialog.Description id="variation-confirm-description">
              {confirmation?.description}
            </Dialog.Description>
            <div className="variation-confirm-actions">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" autoFocus>
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                onClick={() => {
                  const run = confirmation?.run;
                  focusAfterConfirm.current = true;
                  setConfirmation(null);
                  run?.();
                }}
              >
                {confirmation?.confirm}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
