import Link from "@/components/ui/navigation";
import { Button } from "@/components/ui/button";
export function PageLinks({ path, params, page, pages }: { path: string; params: Record<string, string | undefined>; page: number; pages: number }) {
  const href = (next: number) => `${path}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1])), page: String(next) })}`;
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Halaman {page} dari {pages}</span><div className="flex gap-3">{page > 1 && <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={href(page - 1)}>Sebelumnya</Link></Button>}{page < pages && <Button asChild size="sm" variant="outline" className="min-h-11"><Link href={href(page + 1)}>Berikutnya</Link></Button>}</div></nav>;
}
export function OperationSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 space-y-4 border-t border-line pt-6"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}
