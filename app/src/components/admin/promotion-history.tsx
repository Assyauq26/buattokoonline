import Link from "next/link";
import { formatWibDate } from "@/modules/promotions/marketing-display";
import { promotionAuditLabel } from "./promotion-domain";
export function PromotionHistory({
  entries,
  page,
  total,
  pageUrl,
  expanded = false,
}: {
  entries: { id: string; createdAt: string; action: string }[];
  page: number;
  total: number;
  pageUrl: (page: number) => string;
  expanded?: boolean;
}) {
  return (
    <details className="promo-history" open={expanded}>
      <summary>Riwayat perubahan ({total})</summary>
      <ul>
        {entries.length ? (
          entries.map((h) => (
            <li key={h.id}>
              {formatWibDate(h.createdAt)} · {promotionAuditLabel(h.action)}
            </li>
          ))
        ) : (
          <li>Belum ada perubahan pada halaman ini.</li>
        )}
      </ul>
      <nav className="promo-pagination" aria-label="Halaman riwayat">
        {page > 1 && <Link href={pageUrl(page - 1)}>Sebelumnya</Link>}
        <span>Halaman {page}</span>
        {page * 20 < total && <Link href={pageUrl(page + 1)}>Berikutnya</Link>}
      </nav>
    </details>
  );
}
