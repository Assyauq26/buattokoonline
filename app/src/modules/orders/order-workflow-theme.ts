import "server-only";
import { cache } from "react";
import { readDraft } from "@/modules/appearance/service";
import { themeStyle } from "@/modules/appearance/runtime";
/** Resolve appearance with page data; do not add an async layout around lazy Flight children. */
export const orderWorkflowStyle = cache(async () =>
  themeStyle((await readDraft()).config),
);
