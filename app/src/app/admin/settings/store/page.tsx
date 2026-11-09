import { readDraft } from "@/modules/appearance/service";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { StoreInformation } from "@/components/admin/store-information";
export default async function Page() {
  await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_READ);
  const state = await readDraft();
  return (
    <StoreInformation
      initial={state.config.identity}
      versions={{
        draftVersion: state.draftVersion,
        publishedVersion: state.publishedVersion,
      }}
    />
  );
}
