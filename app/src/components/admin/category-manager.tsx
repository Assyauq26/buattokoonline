"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveCategoryAction } from "@/modules/catalog/product-management.actions";
import { EmptyState } from "@/components/ui/empty-state";
type Category = { id: string; name: string; slug: string; parentId: string | null; sortOrder: number };
export function CategoryManager({ categories, canCreate, canEdit }: { categories: Category[]; canCreate: boolean; canEdit: boolean }) {
  const router = useRouter();
  const empty = { name: "", slug: "", parentId: null as string | null, sortOrder: 0 };
  const [id, setId] = useState<string | null>(null);
  const [value, setValue] = useState(empty);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusEdit, setFocusEdit] = useState<string | null>(null);
  useEffect(() => { if (focusEdit) { document.getElementById(`category-edit-${focusEdit}`)?.focus(); setFocusEdit(null); } }, [focusEdit]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError(""); setNotice("");
    try {
      const result = await saveCategoryAction(id, value);
      if (!result.ok) { setError(result.error || "Kategori gagal disimpan"); return; }
      if (id) setFocusEdit(id);
      setId(null); setValue(empty); setNotice("Kategori berhasil disimpan."); router.refresh();
    } catch { setError("Kategori gagal disimpan. Coba lagi."); } finally { setPending(false); }
  }
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
    <div aria-live="polite" className={error || notice ? "lg:col-span-2" : "sr-only"}>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}</div>
    <section className="min-w-0 space-y-3">{!categories.length ? <EmptyState title="Belum ada kategori" description="Tambahkan kategori agar katalog lebih mudah dijelajahi." /> : <ul className="divide-y divide-line rounded-2xl border border-line bg-white">{categories.map(c => <li key={c.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="break-words text-sm font-semibold">{c.name}</p><p className="mt-1 break-words text-xs text-ink-soft">/{c.slug}{c.parentId ? ` · Induk: ${categories.find(p => p.id === c.parentId)?.name || "—"}` : ""}</p></div>{canEdit && <Button id={`category-edit-${c.id}`} type="button" variant="ghost" size="sm" disabled={pending} onClick={() => { setId(c.id); setValue({ name: c.name, slug: c.slug, parentId: c.parentId, sortOrder: c.sortOrder }); setError(""); setNotice(""); }}>Edit<span className="sr-only"> {c.name}</span></Button>}</li>)}</ul>}</section>
    {(canCreate || (id && canEdit)) && <form onSubmit={submit} className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-5"><h2 className="text-lg font-semibold">{id ? "Edit kategori" : "Tambah kategori"}</h2><fieldset disabled={pending} className="min-w-0 space-y-4">
      <div><Label htmlFor="category-name">Nama kategori</Label><Input id="category-name" value={value.name} required minLength={2} maxLength={120} onChange={e => setValue(v => ({ ...v, name: e.target.value }))} /></div>
      <div><Label htmlFor="category-slug">Slug</Label><Input id="category-slug" value={value.slug} required maxLength={120} onChange={e => setValue(v => ({ ...v, slug: e.target.value }))} /></div>
      <div><Label htmlFor="category-parent">Kategori induk</Label><select id="category-parent" value={value.parentId || ""} onChange={e => setValue(v => ({ ...v, parentId: e.target.value || null }))} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"><option value="">Tanpa induk</option>{categories.filter(c => c.id !== id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><Label htmlFor="category-order">Urutan tampil</Label><Input id="category-order" type="number" min={0} max={100000} step={1} value={value.sortOrder} onChange={e => setValue(v => ({ ...v, sortOrder: Number(e.target.value) }))} /></div>
      <div className="flex flex-wrap gap-3"><Button type="submit">{pending ? "Menyimpan..." : "Simpan kategori"}</Button>{id && <Button type="button" variant="outline" onClick={() => { setId(null); setValue(empty); setError(""); }}>Batal edit</Button>}</div>
    </fieldset></form>}
  </div>;
}
