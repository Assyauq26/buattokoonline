import { MissingPage } from "@/components/fashion/missing-page";
import { getPublishedAppearance } from "@/modules/appearance/published";

export default async function NotFound() {
  const { config } = await getPublishedAppearance();
  return <MissingPage fashion={config.themeId === "immersive-fashion"}/>;
}
