"use client";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/money";
export type AddedProduct = {
  name: string;
  variantLabel: string;
  image: string | null;
  quantity: number;
  unitPrice: number;
};
export function CartSuccessSheet({
  item,
  onContinue,
  onCart,
}: {
  item: AddedProduct;
  onContinue: () => void;
  onCart: () => void;
}) {
  return (
    <div
      data-testid="cart-success-sheet"
      className="flex min-h-0 flex-col gap-6"
    >
      <div className="flex shrink-0 items-center gap-2">
        <CheckCircle2
          size={22}
          className="shrink-0 text-success"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold sm:text-base">
          Berhasil ditambahkan ke keranjang
        </span>
      </div>
      <div className="purchase-summary flex min-h-0 gap-4 overflow-y-auto">
        <div className="purchase-thumbnail">
          {item.image ? (
            <Image
              src={item.image}
              alt={item.name}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized={item.image.startsWith("/api/v1/product-images/")}
            />
          ) : (
            <span>Tanpa foto</span>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 break-words font-semibold">{item.name}</p>
          <p className="break-words text-sm">{item.variantLabel}</p>
          <p className="text-sm">
            {item.quantity} × {formatIDR(item.unitPrice)}
          </p>
          <p className="text-sm font-semibold" data-theme-role="price">
            Subtotal: {formatIDR(item.unitPrice * item.quantity)}
          </p>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Button variant="outline" className="min-w-0 px-2" onClick={onContinue}>
          Lanjut Belanja
        </Button>
        <Button className="min-w-0 px-2" onClick={onCart}>
          Lihat Keranjang
        </Button>
      </div>
    </div>
  );
}
