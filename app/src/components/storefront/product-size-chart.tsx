import { Ruler, ChevronRight } from "lucide-react";
/* eslint-disable @next/next/no-img-element -- Session-bound private media and blob previews must retain browser credentials. */
import type { SizeChart } from "@/modules/catalog/product-size-chart";
export function ProductSizeChart({
  chart,
  image,
  name,
}: {
  chart: SizeChart | null;
  image: { url: string; alt: string } | null;
  name: string;
}) {
  if (!chart || (chart.mode === "image" && !image)) return null;
  return (
    <details className="pdp-detail-row py-4" data-testid="product-size-chart">
      <summary className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <Ruler size={19} className="shrink-0" aria-hidden="true" />
        <span className="flex-1">Panduan Ukuran</span>
        <ChevronRight
          size={19}
          className="pdp-detail-chevron shrink-0"
          aria-hidden="true"
        />
      </summary>
      {chart.mode === "image" && image ? (
        <img
          src={image.url}
          alt={image.alt || `Tabel ukuran ${name}`}
          className="mt-3 h-auto max-w-full rounded-lg"
        />
      ) : chart.mode === "table" ? (
        <>
          {chart.table.unit && (
            <p className="my-2 text-xs text-zinc-600">
              Satuan: {chart.table.unit === "inch" ? "inci" : "cm"}
            </p>
          )}
          <div
            className="max-w-full overflow-x-auto"
            role="region"
            aria-label="Tabel ukuran produk"
            tabIndex={0}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Tabel ukuran {name}</caption>
              <thead>
                <tr>
                  {chart.table.columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className="whitespace-nowrap border border-zinc-200 bg-zinc-50 p-3"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.table.rows.map((row) => (
                  <tr key={row.id}>
                    {chart.table.columns.map((column) => (
                      <td
                        key={column.id}
                        className="whitespace-nowrap border border-zinc-200 p-3"
                      >
                        {row.cells[column.id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </details>
  );
}
