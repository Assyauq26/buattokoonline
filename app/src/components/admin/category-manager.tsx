"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveCategoryAction } from "@/modules/catalog/product-management.actions";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CATEGORY_ICON_REGISTRY,
  getCategoryIconDefinition,
  renderCategoryIcon,
} from "@/modules/catalog/category-icon-registry";
import { Search, X, Check } from "lucide-react";

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  iconKey?: string | null;
  sortOrder: number;
};

export function CategoryManager({
  categories,
  canCreate,
  canEdit,
}: {
  categories: Category[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const empty = {
    name: "",
    slug: "",
    parentId: null as string | null,
    iconKey: null as string | null,
    sortOrder: 0,
  };

  const [id, setId] = useState<string | null>(null);
  const [value, setValue] = useState(empty);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusEdit, setFocusEdit] = useState<string | null>(null);

  // Icon Picker State
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("Semua");

  const groups = [
    "Semua",
    "Denim & Jeans",
    "Atasan",
    "Bawahan",
    "Fashion & Aksesoris",
    "Umum",
  ];

  const filteredIcons = CATEGORY_ICON_REGISTRY.filter((ic) => {
    const matchSearch =
      ic.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
      ic.key.toLowerCase().includes(iconSearch.toLowerCase());
    const matchGroup =
      selectedGroup === "Semua" || ic.group === selectedGroup;
    return matchSearch && matchGroup;
  });

  const currentIconDef = getCategoryIconDefinition(value.iconKey);

  useEffect(() => {
    if (focusEdit) {
      document.getElementById(`category-edit-${focusEdit}`)?.focus();
      setFocusEdit(null);
    }
  }, [focusEdit]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await saveCategoryAction(id, value);
      if (!result.ok) {
        setError(result.error || "Kategori gagal disimpan");
        return;
      }
      if (id) setFocusEdit(id);
      setId(null);
      setValue(empty);
      setShowIconPicker(false);
      setNotice("Kategori berhasil disimpan.");
      router.refresh();
    } catch {
      setError("Kategori gagal disimpan. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
      <div
        aria-live="polite"
        className={error || notice ? "lg:col-span-2" : "sr-only"}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-green-700 font-medium">
            {notice}
          </p>
        )}
      </div>

      {/* CATEGORY LIST */}
      <section className="min-w-0 space-y-3">
        {!categories.length ? (
          <EmptyState
            title="Belum ada kategori"
            description="Tambahkan kategori agar katalog lebih mudah dijelajahi."
          />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white shadow-sm">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 p-4 hover:bg-zinc-50/50 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-zinc-50 text-zinc-700">
                    {renderCategoryIcon(c.iconKey, {
                      className: "w-5 h-5",
                      color: "currentColor",
                    })}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-zinc-900">
                      {c.name}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-ink-soft">
                      /{c.slug}
                      {c.parentId
                        ? ` · Induk: ${
                            categories.find((p) => p.id === c.parentId)?.name ||
                            "—"
                          }`
                        : ""}
                      {c.iconKey ? ` · Ikon: ${c.iconKey}` : ""}
                    </p>
                  </div>
                </div>

                {canEdit && (
                  <Button
                    id={`category-edit-${c.id}`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setId(c.id);
                      setValue({
                        name: c.name,
                        slug: c.slug,
                        parentId: c.parentId,
                        iconKey: c.iconKey ?? null,
                        sortOrder: c.sortOrder,
                      });
                      setError("");
                      setNotice("");
                      setShowIconPicker(false);
                    }}
                  >
                    Edit<span className="sr-only"> {c.name}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CATEGORY FORM */}
      {(canCreate || (id && canEdit)) && (
        <form
          onSubmit={submit}
          className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">
            {id ? "Edit kategori" : "Tambah kategori"}
          </h2>

          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <div>
              <Label htmlFor="category-name">Nama kategori</Label>
              <Input
                id="category-name"
                value={value.name}
                required
                minLength={2}
                maxLength={120}
                onChange={(e) =>
                  setValue((v) => ({ ...v, name: e.target.value }))
                }
              />
            </div>

            <div>
              <Label htmlFor="category-slug">Slug</Label>
              <Input
                id="category-slug"
                value={value.slug}
                required
                maxLength={120}
                onChange={(e) =>
                  setValue((v) => ({ ...v, slug: e.target.value }))
                }
              />
            </div>

            {/* CATEGORY ICON PICKER */}
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-zinc-800">
                  Ikon Kategori
                </Label>
                {value.iconKey && (
                  <button
                    type="button"
                    onClick={() =>
                      setValue((v) => ({ ...v, iconKey: null }))
                    }
                    className="text-xs text-red-600 hover:underline"
                  >
                    Reset ke default
                  </button>
                )}
              </div>

              {/* Current Icon Preview Box */}
              <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[#D9AC61]">
                  {renderCategoryIcon(value.iconKey, {
                    className: "w-6 h-6",
                    color: "currentColor",
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900">
                    {value.iconKey ? currentIconDef.label : "Ikon Bawaan (Koleksi)"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {value.iconKey ? `Kunci: ${value.iconKey}` : "Belum dipilih"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                >
                  {showIconPicker ? "Tutup" : "Pilih Ikon"}
                </Button>
              </div>

              {/* Expandable Icon Selection Grid */}
              {showIconPicker && (
                <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-inner">
                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Cari ikon (cth: baggy, dress, sepatu)..."
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-200 pl-8 pr-3 text-xs focus:border-zinc-500 focus:outline-none"
                    />
                  </div>

                  {/* Group filter tabs */}
                  <div className="flex flex-wrap gap-1">
                    {groups.map((grp) => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setSelectedGroup(grp)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                          selectedGroup === grp
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {grp}
                      </button>
                    ))}
                  </div>

                  {/* Icons Grid */}
                  <div className="grid max-h-56 grid-cols-4 sm:grid-cols-5 gap-2 overflow-y-auto p-1">
                    {filteredIcons.map((ic) => {
                      const isSelected = value.iconKey === ic.key;
                      return (
                        <button
                          key={ic.key}
                          type="button"
                          onClick={() => {
                            setValue((v) => ({ ...v, iconKey: ic.key }));
                            setShowIconPicker(false);
                          }}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-all ${
                            isSelected
                              ? "border-zinc-900 bg-zinc-900 text-[#D9AC61] shadow-sm"
                              : "border-zinc-200 bg-zinc-50/50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100"
                          }`}
                        >
                          <div className="flex h-7 w-7 items-center justify-center">
                            {ic.render({
                              className: "w-5 h-5",
                              color: isSelected ? "#D9AC61" : "currentColor",
                            })}
                          </div>
                          <span className="line-clamp-1 text-[10px] font-medium leading-tight">
                            {ic.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="category-parent">Kategori induk</Label>
              <select
                id="category-parent"
                value={value.parentId || ""}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    parentId: e.target.value || null,
                  }))
                }
                className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
              >
                <option value="">Tanpa induk</option>
                {categories
                  .filter((c) => c.id !== id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Label htmlFor="category-order">Urutan tampil</Label>
              <Input
                id="category-order"
                type="number"
                min={0}
                max={100000}
                step={1}
                value={value.sortOrder}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    sortOrder: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit">
                {pending ? "Menyimpan..." : "Simpan kategori"}
              </Button>
              {id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setId(null);
                    setValue(empty);
                    setError("");
                    setShowIconPicker(false);
                  }}
                >
                  Batal edit
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
