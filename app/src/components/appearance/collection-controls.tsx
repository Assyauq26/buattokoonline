"use client";
import {
  defaultCollections,
  type FashionCollection,
  type StoreAppearanceV1,
} from "@/modules/appearance/schema";
import type { Change } from "./controls";

const sources = {
  featured: "Pilihan manual (produk unggulan)",
  newest: "Produk terbaru",
  bestselling: "Produk terlaris dibayar",
  category: "Kategori",
  flash: "Flash Sale aktif",
};

export function CollectionControls({
  draft,
  change,
}: {
  draft: StoreAppearanceV1;
  change: Change;
}) {
  const rows = draft.collections ?? defaultCollections;
  function update(index: number, patch: Partial<FashionCollection>) {
    change((d) => {
      const list = (d.collections ??= structuredClone(defaultCollections));
      Object.assign(list[index], patch);
    });
  }
  function move(index: number, offset: number) {
    change((d) => {
      const list = (d.collections ??= structuredClone(defaultCollections));
      list.splice(index + offset, 0, list.splice(index, 1)[0]);
    });
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 font-bold">Koleksi Immersive Fashion</legend>
      {rows.map((row, i) => (
        <details className="rounded-xl border p-3" key={row.id}>
          <summary className="cursor-pointer py-1">
            {row.title || "Koleksi baru"}
          </summary>
          <div className="my-3 grid gap-3 text-sm [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:p-2 [&_select]:w-full">
            <label>
              Judul
              <input
                value={row.title}
                maxLength={60}
                onChange={(e) => update(i, { title: e.target.value })}
              />
            </label>
            <label>
              Deskripsi
              <input
                value={row.description}
                maxLength={160}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            </label>
            <label>
              Sumber produk
              <select
                value={row.source}
                onChange={(e) =>
                  update(i, {
                    source: e.target.value as FashionCollection["source"],
                  })
                }
              >
                {Object.entries(sources).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {row.source === "category" && (
              <label>
                Slug kategori
                <input
                  value={row.category}
                  onChange={(e) => update(i, { category: e.target.value })}
                />
              </label>
            )}
            <label>
              Foto sampul opsional (path foto produk toko)
              <input
                placeholder="/api/v1/product-images/…"
                value={row.cover}
                onChange={(e) => update(i, { cover: e.target.value })}
              />
            </label>
            {(["mobileFocus", "desktopFocus"] as const).map((k) => (
              <label key={k}>
                Posisi vertikal foto{" "}
                {k === "mobileFocus" ? "mobile" : "desktop"} · {row[k]}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={row[k]}
                  onChange={(e) => update(i, { [k]: Number(e.target.value) })}
                />
              </label>
            ))}
            <div className="flex gap-4">
              <button type="button" disabled={!i} onClick={() => move(i, -1)}>
                Naik
              </button>
              <button
                type="button"
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                Turun
              </button>
              <button
                type="button"
                disabled={rows.length === 1}
                onClick={() =>
                  change((d) => {
                    d.collections = rows.filter((x) => x.id !== row.id);
                  })
                }
              >
                Hapus koleksi
              </button>
            </div>
          </div>
        </details>
      ))}
      <button
        type="button"
        disabled={rows.length >= 12}
        className="min-h-11 rounded-lg border"
        onClick={() =>
          change((d) => {
            d.collections = [
              ...rows,
              {
                ...defaultCollections[1],
                id: crypto.randomUUID(),
                title: "Koleksi baru",
                description: "",
              },
            ];
          })
        }
      >
        Tambah koleksi
      </button>
    </fieldset>
  );
}
