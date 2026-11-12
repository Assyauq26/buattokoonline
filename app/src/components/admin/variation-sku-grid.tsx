"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, Filter, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canonicalOption,
  type OptionGroup,
} from "@/modules/catalog/variation-domain";
import type { ProductInput } from "@/modules/catalog/product-management.validation";
type Row = ProductInput["variants"][number] & {
  reserved?: number;
  protected?: boolean;
};
export function VariationSkuGrid({
  rows,
  groups,
  photos,
  selected,
  selectedOnly,
  disabled,
  canStock,
  basePrice,
  errors,
  onSelect,
  onChange,
  onRemove,
}: {
  rows: Row[];
  groups: OptionGroup[];
  photos: { id: string; url: string; alt: string }[];
  selected: Set<number>;
  selectedOnly: boolean;
  disabled: boolean;
  canStock: boolean;
  basePrice: number;
  errors?: Record<string, string>;
  onSelect: (index: number, checked: boolean) => void;
  onChange: (index: number, patch: Partial<Row>) => void;
  onRemove: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(new Set<number>());
  useEffect(() => {
    if (errors && Object.keys(errors).length) {
      setQuery("");
      setFilter("all");
    }
  }, [errors]);
  const label = (row: Row) =>
    groups
      .flatMap((g) =>
        g.values
          .filter((v) => row.optionValueIds?.includes(v.id))
          .map((v) => v.value),
      )
      .join(" / ") || "SKU dasar";
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row, index }) =>
        canonicalOption(label(row) + " " + row.sku).includes(
          canonicalOption(query),
        ) &&
        (filter === "all" ||
          (filter === "empty-stock" && row.onHand === 0) ||
          (filter === "inherit" && row.price == null) ||
          (filter === "selected" && selected.has(index))),
    );
  const fieldError = (id: string) =>
    errors?.[id] ? (
      <p id={id + "-error"} role="alert" className="editor-field-error">
        {errors[id]}
      </p>
    ) : null;
  return (
    <section className="variation-sku-grid" aria-label="Harga dan stok SKU">
      <div className="variation-sku-search">
        <label>
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Cari SKU atau kombinasi</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari SKU (mis. Sage / M)"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          aria-expanded={showFilter}
          onClick={() => setShowFilter((v) => !v)}
        >
          <Filter size={16} aria-hidden="true" />
          Filter
        </Button>
      </div>
      {showFilter && (
        <fieldset className="variation-sku-filters">
          <legend className="sr-only">Filter SKU</legend>
          {[
            ["all", "Semua SKU"],
            ["empty-stock", "Stok kosong"],
            ["inherit", "Harga mengikuti utama"],
            ["selected", "SKU dipilih"],
          ]
            .filter(
              ([id]) =>
                id !== "empty-stock" ||
                rows.some((r) => r.onHand !== undefined),
            )
            .map(([id, name]) => (
              <label key={id}>
                <input
                  type="radio"
                  name="sku-filter"
                  value={id}
                  checked={filter === id}
                  onChange={() => setFilter(id)}
                />
                {name}
              </label>
            ))}
        </fieldset>
      )}
      <div className="variation-sku-grid-heading" aria-hidden="true">
        <span>Kombinasi SKU</span>
        <span className="sku-code-heading">Kode SKU</span>
        <span>Harga normal (Rp)</span>
        <span>Diskon (Rp)</span>
        <span>Stok</span>
        <span className="sku-code-heading" />
      </div>
      {!visible.length && (
        <p className="variation-empty-search" role="status">
          Tidak ada SKU yang sesuai pencarian atau filter.
        </p>
      )}
      {visible.map(({ row, index }) => {
        const text = label(row),
          value = groups
            .find((g) => g.allowsImage)
            ?.values.find((v) => row.optionValueIds?.includes(v.id));
        const photo = photos.find((p) => p.id === value?.imageId);
        const open = expanded.has(index) || Boolean(errors?.[`sku-${index}`]);
        return (
          <div
            key={row.id || [...(row.optionValueIds || [])].sort().join("|")}
            className="variation-sku-grid-row"
          >
            <div className="variation-sku-combination">
              {selectedOnly && (
                <label className="variation-sku-check">
                  <input
                    type="checkbox"
                    aria-label={`Pilih SKU ${index + 1}`}
                    disabled={disabled}
                    checked={selected.has(index)}
                    onChange={(e) => onSelect(index, e.target.checked)}
                  />
                </label>
              )}
              <button
                type="button"
                className="variation-sku-name"
                aria-expanded={open}
                aria-controls={`sku-metadata-${index}`}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
              >
                {photo && (
                  <Image
                    unoptimized
                    src={photo.url}
                    alt=""
                    width={32}
                    height={36}
                  />
                )}
                <span>{text}</span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </div>
            {(
              [
                ["price", "Harga normal (Rp)", "price"],
                ["salePrice", "Harga diskon (Rp)", "sale"],
              ] as const
            ).map(([key, title, id]) => (
              <div key={key} className="variation-field variation-sku-number">
                <label className="sr-only" htmlFor={`sku-${id}-${index}`}>
                  {title} — {text}
                </label>
                <input
                  id={`sku-${id}-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  max={2147483647}
                  value={row[key] ?? ""}
                  placeholder={
                    key === "price" ? String(basePrice || 0) : "Opsional"
                  }
                  disabled={disabled}
                  aria-invalid={Boolean(errors?.[`sku-${id}-${index}`])}
                  aria-describedby={
                    errors?.[`sku-${id}-${index}`]
                      ? `sku-${id}-${index}-error`
                      : undefined
                  }
                  onChange={(e) =>
                    onChange(index, {
                      [key]: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
                {fieldError(`sku-${id}-${index}`)}
              </div>
            ))}
            <div className="variation-field variation-sku-number">
              <label className="sr-only" htmlFor={`sku-stock-${index}`}>
                Stok fisik — {text}
              </label>
              {row.onHand !== undefined ? (
                <>
                  <input
                    id={`sku-stock-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={row.reserved ?? 0}
                    step={1}
                    max={2147483647}
                    value={row.onHand}
                    disabled={disabled || !canStock}
                    aria-invalid={Boolean(errors?.[`sku-stock-${index}`])}
                    aria-describedby={
                      errors?.[`sku-stock-${index}`]
                        ? `sku-stock-${index}-error`
                        : undefined
                    }
                    onChange={(e) =>
                      onChange(index, { onHand: Number(e.target.value) })
                    }
                  />
                  {fieldError(`sku-stock-${index}`)}
                </>
              ) : (
                <span className="variation-stock-restricted">
                  Akses dibatasi
                </span>
              )}
            </div>
            <div
              className="variation-sku-metadata"
              id={`sku-metadata-${index}`}
              data-open={open}
            >
              <div className="variation-field">
                <label htmlFor={`sku-${index}`}>Kode SKU — {text}</label>
                <input
                  id={`sku-${index}`}
                  maxLength={80}
                  value={row.sku}
                  readOnly={row.protected}
                  disabled={disabled}
                  aria-invalid={Boolean(errors?.[`sku-${index}`])}
                  aria-describedby={
                    errors?.[`sku-${index}`] ? `sku-${index}-error` : undefined
                  }
                  onChange={(e) => onChange(index, { sku: e.target.value })}
                />
                {fieldError(`sku-${index}`)}
                <small>
                  {row.protected
                    ? "Kode terkunci karena stok atau riwayat."
                    : "Kode unik untuk kombinasi ini."}
                  {row.onHand !== undefined
                    ? ` ${row.reserved ?? 0} direservasi · ${Math.max(0, row.onHand - (row.reserved ?? 0))} tersedia.`
                    : ""}
                </small>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="variation-remove-sku"
                aria-label={`Hapus SKU ${text}`}
                disabled={disabled || rows.length <= 1 || row.protected}
                onClick={() => onRemove(index)}
              >
                <Trash2 size={16} />
                Hapus SKU
              </Button>
            </div>
          </div>
        );
      })}
      {(query || filter !== "all") && (
        <p className="variation-sku-result" role="status">
          {visible.length} dari {rows.length} SKU ditampilkan
        </p>
      )}
    </section>
  );
}
