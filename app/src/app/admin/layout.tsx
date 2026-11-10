import { StoreWordmark } from "@/components/brand/store-wordmark";
import { readDraft } from "@/modules/appearance/service";
import { getPublishedAppearance } from "@/modules/appearance/published";
import { themeStyle } from "@/modules/appearance/runtime";
import "@/components/admin/variation-editor.css";
import { OperationNotice } from "@/components/admin/operation-notice";
import Link from "@/components/ui/navigation";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminMobileBottomNav, AdminNav } from "@/components/admin/admin-nav";
import { LogoutButton } from "@/components/storefront/logout-button";
import { RegistrationOtpCleanup } from "@/components/auth/registration-otp-cleanup";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";
import { Bell, ChevronDown, Search, Store } from "lucide-react";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const user = await getCurrentUser(false);
  if (!user?.isAdmin)
    return { title: { absolute: "Admin" }, robots: { index: false } };
  const { config } = await readDraft();
  return {
    title: {
      absolute: `Admin | ${config.identity.name}`,
      template: `%s | ${config.identity.name}`,
    },
    robots: { index: false },
  };
}

function Initials({ name }: { name: string }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white"
    >
      {letters || "A"}
    </span>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser(false);
  if (!user) redirect("/login?redirectTo=/admin");
  if (!user.isAdmin) redirect("/");
  const { config } = await getPublishedAppearance();

  return (
    <div
      style={themeStyle(config)}
      className="admin-shell min-h-screen bg-[#fafafa] text-zinc-950 md:flex"
    >
      <RegistrationOtpCleanup />
      <aside
        className="sticky top-0 hidden h-screen w-[238px] shrink-0 flex-col justify-between overflow-y-auto border-r border-zinc-200 bg-white pb-5 md:flex"
        aria-label="Sidebar admin"
      >
        <div>
          <div className="px-7 pb-7 pt-6">
            <Link
              href="/admin"
              className="font-display text-[27px] font-extrabold tracking-[-0.055em] text-black"
            >
              <StoreWordmark draft />
            </Link>
            <h1 className="mt-1 text-xs font-medium text-zinc-400">
              Dashboard toko
            </h1>
          </div>
          <AdminNav
            permissions={user.permissions}
            canManageJnt={isJntSettingsAdministrator(user)}
          />
        </div>
        {(user.permissions.includes(PERMISSIONS.PROMOTION_CREATE) ||
          user.permissions.includes(PERMISSIONS.PROMOTION_UPDATE)) && (
          <Link
            href="/admin/marketing"
            prefetch={false}
            className="mx-4 mt-8 flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3.5 text-xs leading-relaxed text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            <span>⚡ Tingkatkan penjualan dengan promosi</span>
            <ChevronDown size={15} className="-rotate-90" />
          </Link>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="admin-global-header sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="hidden h-[72px] items-center justify-between gap-6 px-5 lg:px-7 md:flex">
            {user.permissions.includes(PERMISSIONS.PRODUCT_READ) && (
              <form
                action="/admin/products"
                method="get"
                role="search"
                aria-label="Pencarian produk dari header"
                className="relative w-full max-w-[420px]"
              >
                <Search
                  size={19}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="search"
                  name="q"
                  placeholder="Cari produk..."
                  className="h-10 w-full rounded-full border border-transparent bg-zinc-100 pl-11 pr-4 text-sm outline-none transition focus:border-zinc-600"
                />
              </form>
            )}
            <div className="ml-auto flex items-center gap-5">
              <span
                aria-label="Pusat notifikasi belum tersedia"
                title="Pusat notifikasi belum tersedia"
                className="text-zinc-700"
              >
                <Bell size={21} />
              </span>
              <Link
                href="/"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-medium transition hover:bg-zinc-50"
              >
                <Store size={18} /> <StoreWordmark draft />{" "}
                <ChevronDown size={15} />
              </Link>
              <details className="relative">
                <summary
                  className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl [&::-webkit-details-marker]:hidden"
                  aria-label="Menu akun admin"
                >
                  <Initials name={user.name} />
                  <span className="hidden text-left xl:block">
                    <span className="block max-w-36 truncate text-xs font-semibold">
                      {user.name}
                    </span>
                    <span className="block text-[11px] text-zinc-400">
                      {user.roles[0] ?? "Admin"}
                    </span>
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <div className="absolute right-0 top-full mt-2 min-w-52 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="mb-3 text-xs text-zinc-500">
                    {user.roles[0] ?? "Admin"}
                  </p>
                  <LogoutButton />
                </div>
              </details>
            </div>
          </div>
          <div className="flex min-h-[88px] items-center justify-between gap-3 px-5 py-4 md:hidden">
            <div>
              <Link
                href="/admin"
                className="font-display text-[29px] font-extrabold leading-none tracking-[-0.06em]"
              >
                <StoreWordmark draft />
              </Link>
              <h1 className="mt-1 text-xs font-medium text-zinc-400">
                Dashboard toko
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="grid size-11 place-items-center rounded-full bg-zinc-100 text-zinc-700"
                title="Notifikasi belum tersedia"
              >
                <Bell size={22} />
              </span>
              <details className="relative">
                <summary
                  aria-label="Menu toko"
                  className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-zinc-100 px-2 [&::-webkit-details-marker]:hidden"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-zinc-200">
                    <Store size={18} />
                  </span>
                  <ChevronDown size={17} />
                </summary>
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
                  <p className="mb-2 truncate text-sm font-semibold">
                    {user.name}
                  </p>
                  <Link
                    href="/"
                    className="mb-3 flex min-h-10 items-center gap-2 text-sm"
                  >
                    <Store size={16} /> Buka toko
                  </Link>
                  <LogoutButton />
                </div>
              </details>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="mx-auto min-w-0 max-w-[1500px] px-4 pb-28 pt-4 sm:px-6 md:px-6 md:pb-8 md:pt-6 lg:px-7"
        >
          <OperationNotice />
          {children}
        </main>
        <div className="admin-bottom-nav">
          <AdminMobileBottomNav
            permissions={user.permissions}
            canManageJnt={isJntSettingsAdministrator(user)}
          />
        </div>
      </div>
    </div>
  );
}
