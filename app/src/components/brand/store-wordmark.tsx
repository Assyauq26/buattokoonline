import { getPublishedAppearance } from "@/modules/appearance/published";
import { readDraft } from "@/modules/appearance/service";
import { AppearanceProvider, StoreLogo } from "@/components/appearance/context";
/** Draft identity is used only inside authenticated admin layouts. */
export async function StoreWordmark({ draft = false }: { draft?: boolean }) {
  const { config } = draft ? await readDraft() : await getPublishedAppearance();
  return <AppearanceProvider config={config} preview={draft}><StoreLogo /></AppearanceProvider>;
}
