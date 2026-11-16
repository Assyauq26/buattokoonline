"use server";
import { getPublishedAppearance } from "@/modules/appearance/published";
import { fashionFrame } from "./fashion-catalog";

export async function readCatalogPosition(id: string, position: number) {
  if (
    typeof id !== "string" ||
    id.length > 40 ||
    !Number.isSafeInteger(position) ||
    position < 0
  )
    throw Error("Posisi tidak valid");
  const { config } = await getPublishedAppearance();
  if (config.themeId !== "immersive-fashion") throw Error("Tema telah berubah");
  return fashionFrame(config.collections, id, position);
}
