"use client";
import { useEffect, useMemo, useState } from "react";
import {
  initialPurchaseOptions,
  selectedPurchaseVariant,
  purchaseImage,
  type PurchaseProduct,
} from "@/modules/catalog/purchase-options";
export function useProductOptions(
  product: PurchaseProduct,
  initialOptions?: Record<string, string>,
  initialQuantity = 1,
) {
  const [options, setOptions] = useState(
    () => initialOptions ?? initialPurchaseOptions(product.groups),
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const selected = useMemo(
    () => selectedPurchaseVariant(product, options),
    [product, options],
  );
  const maximum = selected?.available ?? 0;
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setQuantity((current) => {
      const next = Math.max(1, Math.min(current, maximum || 1));
      return next;
    });
  }, [maximum]);
  function changeOptions(next: Record<string, string>) {
    const stock = selectedPurchaseVariant(product, next)?.available ?? 0;
    setNotice(
      quantity > Math.max(1, stock)
        ? "Jumlah disesuaikan dengan stok pilihan baru."
        : "",
    );
    setOptions(next);
  }
  return {
    options,
    setOptions: changeOptions,
    quantity,
    setQuantity,
    selected,
    image: purchaseImage(product, options),
    notice,
  };
}
