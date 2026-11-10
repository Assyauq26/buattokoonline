import { Suspense, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/session";
import { OperationsSkeleton } from "@/components/admin/operations-skeleton";
import Link from "@/components/ui/navigation";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { getSellerDashboard } from "@/modules/admin/dashboard.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatIDR } from "@/lib/money";
import { orderFlow } from "@/modules/orders/flow-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  CreditCard,
  Megaphone,
  Package,
  Plus,
  ShoppingBag,
  Tag,
  Wallet,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await requireBackofficeUser();
  return (
    <Suspense fallback={<OperationsSkeleton />}>
      <DashboardContent user={user} />
    </Suspense>
  );
}

const panel =
  "rounded-xl border border-zinc-200/80 bg-white shadow-[0_3px_24px_rgba(18,18,18,0.025)]";
const idNumber = (n: number) => new Intl.NumberFormat("id-ID").format(n);

function Metric({
  label,
  value,
  description,
  href,
  icon,
  testId,
  compactValue = false,
}: {
  label: string;
  value: string | number;
  description: ReactNode;
  href: string;
  icon: ReactNode;
  testId: string;
  compactValue?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${panel} group relative block min-w-0 px-4 py-4 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md sm:px-5 sm:py-5`}
    >
      <div className="flex min-h-14 items-center gap-2 pr-6 sm:min-h-12">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-800">
          {icon}
        </span>
        <span className="min-w-0 flex-1 break-words text-[11px] font-medium leading-tight text-zinc-700 sm:text-sm">
          {label}
        </span>
      </div>
      <span
        className="absolute right-3 top-5 grid size-7 place-items-center rounded-full bg-zinc-50 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:bg-zinc-100"
        aria-hidden="true"
      >
        <ChevronRight size={15} />
      </span>
      <p
        data-testid={testId}
        className={`mt-3 min-w-0 break-words font-bold leading-tight tracking-[-0.04em] text-zinc-950 ${compactValue ? "text-[clamp(18px,1.8vw,24px)]" : "text-[26px] sm:text-[29px]"}`}
      >
        {value}
      </p>
      <p className="mt-2 min-w-0 break-words text-[11px] leading-relaxed text-zinc-500 sm:text-xs">
        {description}
      </p>
    </Link>
  );
}

/** The service only returns all-time paid sales, not dated buckets.
 * Display an honest empty chart instead of invented daily order/sales figures. */
function SalesPanel({ amount, count }: { amount: number; count: number }) {
  return (
    <section
      id="dashboard-sales"
      className={`${panel} flex min-w-0 flex-col p-5 lg:p-6`}
      aria-label="Ringkasan penjualan"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Penjualan</h2>
          <p className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {formatIDR(amount)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Dari {idNumber(count)} pesanan dengan pembayaran PAID · semua waktu
          </p>
        </div>
        <span className="shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-xs text-zinc-600">
          Semua waktu
        </span>
      </div>
      <div className="relative mt-6 flex min-h-[170px] flex-1 items-center justify-center overflow-hidden rounded-xl sm:min-h-[210px]">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 750 190"
          preserveAspectRatio="none"
        >
          {[23, 64, 105, 146, 187].map((y) => (
            <line
              key={y}
              x1="0"
              x2="750"
              y1={y}
              y2={y}
              stroke="#e8e8e8"
              strokeDasharray="4 5"
              strokeWidth="1"
            />
          ))}
          {[0, 125, 250, 375, 500, 625, 750].map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1="0"
              y2="190"
              stroke="#f2f2f2"
              strokeDasharray="4 6"
            />
          ))}
          <path
            d="M0 186 L750 186"
            fill="none"
            stroke="#52525b"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="relative z-10 max-w-xs rounded-xl bg-white/95 px-5 py-4 text-center shadow-sm backdrop-blur-sm">
          <BarChart3 className="mx-auto mb-2 text-zinc-400" size={23} />
          <p className="text-sm font-semibold text-zinc-700">
            Grafik harian belum tersedia
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Data ringkasan saat ini hanya mencakup total penjualan yang telah
            dibayar.
          </p>
        </div>
      </div>
    </section>
  );
}

function OrderSummary({
  pending,
  processing,
}: {
  pending: number;
  processing: number;
}) {
  return (
    <section className={`${panel} p-5`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Ringkasan pesanan</h2>
        <Link
          href="/admin/orders"
          className="text-xs underline underline-offset-4"
        >
          Lihat semua
        </Link>
      </div>
      <ul className="space-y-1 text-[13px]">
        <li className="flex items-center gap-3 rounded-xl bg-zinc-100 px-3 py-2.5 text-zinc-700">
          <Clock3 size={19} className="text-zinc-700" />
          <span className="flex-1">Pembayaran</span>
          <strong className="font-semibold">{idNumber(pending)}</strong>
        </li>
        <li className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 text-zinc-700">
          <Package size={19} className="text-zinc-700" />
          <span className="flex-1">Diproses</span>
          <strong className="font-semibold">{idNumber(processing)}</strong>
        </li>
        <li className="flex items-center gap-3 px-3 py-2.5 text-zinc-500">
          <CircleHelp size={19} />
          <span className="flex-1">Status pesanan lainnya</span>
          <Link href="/admin/orders" className="text-xs underline">
            Lihat
          </Link>
        </li>
      </ul>
    </section>
  );
}

function StockOverview({
  available,
  reserved,
  variants,
}: {
  available: number;
  reserved: number;
  variants: number;
}) {
  const usable = Math.max(0, available);
  const held = Math.max(0, reserved);
  const percent = usable + held ? (usable / (usable + held)) * 100 : 0;
  return (
    <section className={`${panel} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Stok produk</h2>
        <Link
          href="/admin/inventory"
          className="text-xs underline underline-offset-4"
        >
          Lihat semua
        </Link>
      </div>
      <div className="mt-4 flex items-center justify-between gap-5">
        <div
          className="relative grid size-32 shrink-0 place-items-center rounded-full p-3"
          style={{
            background: `conic-gradient(#27272a 0% ${percent}%, #a1a1aa ${percent}% 100%)`,
          }}
        >
          <div className="grid size-full place-content-center rounded-full bg-white text-center">
            <strong className="text-lg font-bold">{idNumber(available)}</strong>
            <span className="text-[10px] text-zinc-500">Stok tersedia</span>
          </div>
        </div>
        <dl className="min-w-0 flex-1 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-zinc-800" />
            <dt className="flex-1 text-zinc-600">Tersedia</dt>
            <dd className="font-semibold">{idNumber(available)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-zinc-400" />
            <dt className="flex-1 text-zinc-600">Direservasi</dt>
            <dd className="font-semibold">{idNumber(reserved)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-zinc-300" />
            <dt className="flex-1 text-zinc-600">Varian</dt>
            <dd className="font-semibold">{idNumber(variants)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function QuickAction({
  href,
  label,
  icon,
  primary = false,
  className = "",
}: {
  href: string;
  label: string;
  icon: ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`${className || "flex"} min-h-[108px] min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-center text-xs font-medium leading-snug transition hover:-translate-y-0.5 ${primary ? "bg-zinc-950 text-white shadow-lg hover:bg-zinc-800" : "bg-zinc-50 text-zinc-800 hover:bg-zinc-100"}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

async function DashboardContent({ user }: { user: AuthUser }) {
  const data = await getSellerDashboard(user);
  const has = (permission: string) => user.permissions.includes(permission);
  const canCreate =
    has(PERMISSIONS.PRODUCT_CREATE) && has(PERMISSIONS.PRODUCT_READ);
  const canPromote =
    has(PERMISSIONS.PROMOTION_CREATE) || has(PERMISSIONS.PROMOTION_UPDATE);
  const canOrders = has(PERMISSIONS.ORDER_READ);
  return (
    <div className="space-y-5 lg:space-y-6">
      <section
        className="relative isolate flex min-h-[158px] overflow-hidden rounded-2xl bg-[#f2f2f2] px-5 py-6 sm:min-h-[150px] sm:px-7 lg:items-center lg:px-8"
        aria-label="Sambutan dashboard"
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-gradient-to-l from-zinc-200 to-transparent bg-cover bg-center opacity-95 sm:w-[45%] sm:bg-right"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f2f2f2] via-[#f2f2f2]/95 via-45% to-transparent"
          aria-hidden="true"
        />
        <div className="relative z-10 max-w-[68%] sm:max-w-[62%] lg:max-w-[65%]">
          <p className="text-base font-medium tracking-tight sm:text-lg">
            Selamat datang kembali,
          </p>
          <h1 className="mt-1 break-words text-[23px] font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">
            {user.name}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 sm:text-sm">
            Kelola toko dan tingkatkan penjualan hari ini.
          </p>
        </div>
        <p className="absolute bottom-4 right-5 z-10 hidden text-right text-[11px] font-medium leading-normal text-zinc-600 lg:block">
          Fashion minimalis
          <br />
          untuk hari yang lebih baik.
        </p>
        <Link
          href="/"
          aria-label="Lihat toko ini"
          className="absolute bottom-4 right-4 z-20 grid size-10 place-items-center rounded-full bg-white text-zinc-900 shadow-md md:hidden"
        >
          <ChevronRight size={19} />
        </Link>
      </section>

      <section aria-labelledby="dashboard-summary">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="dashboard-summary"
            className="text-xl font-bold tracking-tight md:hidden"
          >
            Ringkasan Toko
          </h2>
          <span className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-700">
            <CalendarDays size={16} /> Semua waktu
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {data.products && (
            <Metric
              label="Produk"
              value={idNumber(data.products.total)}
              description={
                <>
                  {data.products.published} terbit · {data.products.drafts}{" "}
                  draft · {data.products.archived} arsip
                </>
              }
              href="/admin/products"
              icon={<Package size={22} />}
              testId="dashboard-products"
            />
          )}
          {data.inventory && (
            <Metric
              label="Stok tersedia"
              value={idNumber(data.inventory.available)}
              description={
                <>
                  {data.inventory.reserved} direservasi ·{" "}
                  {data.inventory.variants} varian
                </>
              }
              href="/admin/inventory"
              icon={<Boxes size={22} />}
              testId="dashboard-stock"
            />
          )}
          {data.orders && (
            <Metric
              label="Pesanan"
              value={idNumber(data.orders.total)}
              description={
                <>
                  {data.orders.pending} dalam pembayaran
                  <br />
                  {data.orders.processing} diproses
                </>
              }
              href="/admin/orders"
              icon={<ShoppingBag size={22} />}
              testId="dashboard-orders"
            />
          )}
          {data.sales && (
            <Metric
              label="Penjualan dibayar"
              value={formatIDR(data.sales.amount)}
              description={
                <>{data.sales.count} pesanan dengan pembayaran PAID</>
              }
              href="/admin/payments"
              icon={<Wallet size={22} />}
              testId="dashboard-sales"
              compactValue
            />
          )}
        </div>
      </section>

      {!data.products && !data.inventory && !data.orders && !data.sales && (
        <EmptyState
          title="Akses dashboard terbatas"
          description="Role Anda belum memiliki izin untuk melihat ringkasan toko."
        />
      )}
      {data.products?.total === 0 && (
        <EmptyState
          icon={<Package size={32} />}
          title="Mulai isi katalog toko"
          description="Belum ada produk. Buat draft, lengkapi varian dan gambar, lalu terbitkan."
          action={
            canCreate ? (
              <Link
                href="/admin/products/new"
                className="inline-flex rounded-xl bg-black px-4 py-3 text-sm text-white"
              >
                Buat produk pertama
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(295px,0.95fr)]">
        {data.sales ? (
          <SalesPanel amount={data.sales.amount} count={data.sales.count} />
        ) : (
          <section className={`${panel} p-6`}>
            <h2 className="font-bold">Penjualan</h2>
            <p className="mt-3 text-sm text-zinc-500">
              Anda belum memiliki izin melihat data penjualan.
            </p>
          </section>
        )}
        {data.orders && (
          <div className="hidden lg:block">
            <OrderSummary
              pending={data.orders.pending}
              processing={data.orders.processing}
            />
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.3fr_1fr_0.75fr]">
        <section className={`${panel} min-w-0 p-4 sm:p-5`}>
          <h2 className="mb-4 text-lg font-bold">Aksi cepat</h2>
          <div className="grid grid-cols-4 gap-2 sm:gap-3 xl:grid-cols-5">
            {canCreate && (
              <QuickAction
                href="/admin/products/new"
                primary
                icon={<Plus size={28} strokeWidth={1.7} />}
                label="Tambah Produk"
              />
            )}
            {has(PERMISSIONS.PRODUCT_READ) && (
              <QuickAction
                href="/admin/products"
                icon={<Package size={27} strokeWidth={1.7} />}
                label="Kelola Produk"
              />
            )}
            {canOrders && (
              <QuickAction
                href="/admin/orders"
                icon={<ShoppingBag size={27} strokeWidth={1.7} />}
                label="Kelola Pesanan"
              />
            )}
            {canPromote && (
              <QuickAction
                href="/admin/marketing"
                icon={<Tag size={27} strokeWidth={1.7} />}
                label="Buat Promosi"
                className="hidden xl:flex"
              />
            )}
            {data.sales && (
              <QuickAction
                href="/admin#dashboard-sales"
                icon={<BarChart3 size={27} strokeWidth={1.7} />}
                label="Lihat Ringkasan"
              />
            )}
          </div>
        </section>
        {data.inventory && (
          <div className="hidden xl:block">
            <StockOverview
              available={data.inventory.available}
              reserved={data.inventory.reserved}
              variants={data.inventory.variants}
            />
          </div>
        )}
        {has(PERMISSIONS.PRODUCT_READ) && (
          <section className={`${panel} hidden p-5 xl:block`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Produk terlaris</h2>
              <Link href="/admin/products" className="text-xs underline">
                Lihat semua
              </Link>
            </div>
            <div className="mt-9 text-center text-zinc-500">
              <BarChart3 size={25} className="mx-auto mb-2 text-zinc-300" />
              <p className="text-xs leading-relaxed">
                Data peringkat penjualan per produk belum tersedia.
              </p>
            </div>
          </section>
        )}
      </div>

      {data.recent && (
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">
              Pesanan terbaru
            </h2>
            <Link
              href="/admin/orders"
              className="flex items-center gap-1 text-xs underline underline-offset-4"
            >
              Semua pesanan <ChevronRight size={14} />
            </Link>
          </div>
          {!data.recent.length ? (
            <div className={`${panel} p-6`}>
              <EmptyState
                icon={<ShoppingBag size={29} />}
                title="Belum ada pesanan"
                description="Pesanan pembeli akan tampil di sini setelah checkout."
              />
            </div>
          ) : (
            <div className={`${panel} overflow-hidden`}>
              <div className="hidden grid-cols-[1.7fr_1.3fr_1.4fr_0.9fr_0.7fr] gap-4 border-b border-zinc-100 px-5 py-3 text-[11px] text-zinc-500 md:grid">
                <span>No. Pesanan</span>
                <span>Pembeli</span>
                <span>Status</span>
                <span>Total</span>
                <span>Aksi</span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {data.recent.map((order) => (
                  <li
                    key={order.id}
                    className="relative flex items-center gap-3 px-4 py-3.5 md:grid md:grid-cols-[1.7fr_1.3fr_1.4fr_0.9fr_0.7fr] md:gap-4 md:px-5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700">
                        <ShoppingBag size={23} />
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="block truncate text-xs font-bold hover:underline sm:text-sm"
                        >
                          {order.orderNumber}
                        </Link>
                        <span className="mt-1 block truncate text-xs text-zinc-500 md:hidden">
                          {order.user.name}
                        </span>
                        <span className="mt-1 inline-block rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-700 md:hidden">
                          {orderFlow(order).label}
                        </span>
                      </div>
                    </div>
                    <span className="hidden truncate text-xs text-zinc-600 md:block">
                      {order.user.name}
                    </span>
                    <span className="hidden w-fit rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 md:inline-flex">
                      {orderFlow(order).label}
                    </span>
                    <span className="whitespace-nowrap text-xs font-bold tabular-nums sm:text-sm">
                      {formatIDR(order.total)}
                    </span>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      aria-label={`Lihat detail pesanan ${order.orderNumber}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100 md:w-fit md:px-3"
                    >
                      <span className="hidden text-xs md:inline">
                        Lihat detail
                      </span>
                      <ChevronRight size={16} className="md:hidden" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
