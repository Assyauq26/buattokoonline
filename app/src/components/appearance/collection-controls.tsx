"use client";
import { useState } from "react";
import {
  compositionDefaults,
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

function LayerUpload({
  label,
  id,
  role,
  onChange,
}: {
  label: string;
  id?: string;
  role: "background" | "cutout";
  onChange: (id?: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("image", file);
      data.set("requestId", crypto.randomUUID());
      data.set("role", role);
      const response = await fetch("/api/v1/admin/store-branding", {
        method: "POST",
        body: data,
      });
      const result = await response.json();
      if (!response.ok || !result.data?.id)
        throw Error(result.error?.message ?? "Unggah gagal");
      onChange(result.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggah gagal");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label>
        {label}
        <input
          type="file"
          accept={
            role === "cutout"
              ? "image/png,image/webp"
              : "image/png,image/jpeg,image/webp"
          }
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {busy && <span role="status">Mengunggah…</span>}
      {id && (
        <button type="button" onClick={() => onChange(undefined)}>
          Lepas {label.toLowerCase()}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function CollectionControls({
  draft,
  change,
}: {
  draft: StoreAppearanceV1;
  change: Change;
}) {
  const rows = draft.collections ?? defaultCollections;
  function update(index: number, patch: Partial<FashionCollection>) {
    const id = rows[index].id;
    change((d) => {
      const list = (d.collections ??= structuredClone(defaultCollections));
      const row = list.find((item) => item.id === id);
      if (row) Object.assign(row, patch);
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
            <details>
              <summary>Komposisi foto</summary>
              <div className="grid gap-3 py-3">
                <p>
                  Unggah latar bersih tanpa model dan objek transparan untuk
                  mengatur posisinya secara terpisah. Maksimal 2 MiB per gambar.
                </p>
                <LayerUpload
                  label="Latar bersih"
                  role="background"
                  id={row.backgroundId}
                  onChange={(backgroundId) => update(i, { backgroundId })}
                />
                <LayerUpload
                  label="Objek transparan"
                  role="cutout"
                  id={row.cutoutId}
                  onChange={(cutoutId) => update(i, { cutoutId })}
                />
                {row.cutoutId && !row.backgroundId && (
                  <p>Tambahkan latar bersih untuk menampilkan objek.</p>
                )}
                {(["mobile", "desktop"] as const).map((mode) => (
                  <fieldset
                    key={mode}
                    disabled={!row.cutoutId || !row.backgroundId}
                  >
                    <legend>Posisi objek · {mode}</legend>
                    {(["x", "y", "scale"] as const).map((key) => {
                      const current = row[mode] ?? compositionDefaults[mode];
                      return (
                        <label key={key}>
                          {
                            { x: "Horizontal", y: "Vertikal", scale: "Ukuran" }[
                              key
                            ]
                          }{" "}
                          · {current[key]}%
                          <input
                            type="range"
                            min={{ x: 20, y: 35, scale: 55 }[key]}
                            max={{ x: 80, y: 75, scale: 110 }[key]}
                            value={current[key]}
                            onChange={(e) =>
                              update(i, {
                                [mode]: {
                                  ...current,
                                  [key]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update(i, {
                      ...compositionDefaults,
                      mobileFocus: defaultCollections[0].mobileFocus,
                      desktopFocus: defaultCollections[0].desktopFocus,
                    })
                  }
                >
                  Reset posisi dan ukuran
                </button>
              </div>
            </details>
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
