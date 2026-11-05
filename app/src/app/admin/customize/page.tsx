import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { readDraft } from "@/modules/appearance/service";
import { AppearanceEditor } from "@/components/appearance/editor";
import Link from "@/components/ui/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_READ);
  return (
    <div className="space-y-5">
      <Link href="/admin/customize/hero" className="flex min-h-16 items-center justify-between rounded-2xl bg-zinc-900 px-5 py-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800">
        <span>Banner Hero — Gambar, Slide & Konten</span>
        <span aria-hidden="true">›</span>
      </Link>
      <AppearanceEditor
      initial={await readDraft()}
      canUpdate={user.permissions.includes(PERMISSIONS.STORE_CUSTOMIZE_UPDATE)}
      canPublish={user.permissions.includes(
        PERMISSIONS.STORE_CUSTOMIZE_PUBLISH,
      )}
    />
    </div>
  );
}
