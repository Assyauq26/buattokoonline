"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Tag, Ticket } from "lucide-react";
import type { ComponentProps } from "react";
import { PromotionFlashWorkspace } from "./promotion-flash-workspace";
import { PromotionVoucherWorkspace } from "./promotion-voucher-workspace";
import "./promotions.css";
export function PromotionWorkspace({
  flash,
  voucher,
}: {
  flash: ComponentProps<typeof PromotionFlashWorkspace> | null;
  voucher: ComponentProps<typeof PromotionVoucherWorkspace>;
}) {
  const params = useSearchParams(),
    tab = params.get("tab") === "voucher" || !flash ? "voucher" : "flash",
    isForm = ["new", "edit", "detail"].includes(params.get("view") || "");
  function tabUrl(next: string) {
    const p = new URLSearchParams(params.toString());
    p.set("tab", next);
    for (const key of ["id", "view", "step"]) p.delete(key);
    return "/admin/marketing?" + p;
  }
  return (
    <div className="promo-workspace">
      {!isForm && (
        <>
          <header className="promo-head">
            <div>
              <h1>Promosi</h1>
              <p className="promo-muted">Kelola Flash Sale dan voucher toko.</p>
            </div>
          </header>
          <nav className="promo-tabs" aria-label="Jenis promosi">
            {flash && (
              <Link
                href={tabUrl("flash")}
                aria-current={tab === "flash" ? "page" : undefined}
              >
                <Tag size={18} />
                Flash Sale
              </Link>
            )}
            <Link
              href={tabUrl("voucher")}
              aria-current={tab === "voucher" ? "page" : undefined}
            >
              <Ticket size={18} />
              Voucher
            </Link>
          </nav>
        </>
      )}
      {tab === "flash" && flash ? (
        <PromotionFlashWorkspace {...flash} />
      ) : (
        <PromotionVoucherWorkspace {...voucher} />
      )}
    </div>
  );
}
