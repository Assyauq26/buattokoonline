"use client";
import Image from "next/image";
import {
  canChoose,
  type PurchaseProduct,
} from "@/modules/catalog/purchase-options";
export function ProductOptionSelector({
  product,
  options,
  onChange,
  busy = false,
}: {
  product: Pick<PurchaseProduct, "groups" | "variants">;
  options: Record<string, string>;
  onChange: (options: Record<string, string>) => void;
  busy?: boolean;
}) {
  return (
    <div className="space-y-5">
      {product.groups.map((group) => (
        <fieldset key={group.id} disabled={busy} className="min-w-0">
          <legend className="mb-3 text-sm font-semibold">{group.name}</legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const selected = options[group.id] === value.id,
                available = canChoose(product, options, group.id, value.id);
              return (
                <button
                  type="button"
                  key={value.id}
                  data-testid={`option-${value.id}`}
                  aria-pressed={selected}
                  disabled={busy || (!selected && !available)}
                  className="pdp-choice-pill purchase-option"
                  onClick={() =>
                    onChange({
                      ...options,
                      [group.id]: selected ? "" : value.id,
                    })
                  }
                >
                  {group.allowsImage && (
                    <span className="purchase-swatch">
                      {value.image ? (
                        <Image
                          src={value.image.url}
                          alt=""
                          width={32}
                          height={32}
                          className="h-full w-full object-cover"
                          unoptimized={value.image.url.startsWith(
                            "/api/v1/product-images/",
                          )}
                        />
                      ) : (
                        value.value.slice(0, 1)
                      )}
                    </span>
                  )}
                  <span>{value.value}</span>
                  {!available && !selected && (
                    <span className="sr-only"> — tidak tersedia</span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
