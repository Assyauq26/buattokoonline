import { mailBrandSyncPending } from "@/modules/auth/mail-brand-sync";
import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/response";
import { assertSameOrigin } from "@/lib/mutation-origin";
import { requireCustomizePermission } from "@/modules/appearance/authorization";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { appearanceSchema } from "@/modules/appearance/schema";
import { readDraft } from "@/modules/appearance/service";
import { executeAppearanceCommand } from "@/modules/appearance/commands";
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    await requireCustomizePermission(PERMISSIONS.STORE_CUSTOMIZE_PUBLISH);
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError("Data diperlukan", 422);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 8192) {
        await reader.cancel();
        throw new HttpError("Payload terlalu besar", 413);
      }
      chunks.push(value);
    }
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError("JSON tidak valid", 422);
    }
    const payload = z
      .object({
        identity: appearanceSchema.shape.identity,
        draftVersion: z.number().int(),
        publishedVersion: z.number().int(),
      })
      .strict()
      .parse(input);
    const identity = payload.identity;
    const state = await readDraft();
    if (
      payload.draftVersion !== state.draftVersion ||
      payload.publishedVersion !== state.publishedVersion
    )
      throw new HttpError(
        "Informasi berubah. Muat ulang sebelum menyimpan.",
        409,
      );
    const strip = (c: typeof state.config) => ({ ...c, identity: null });
    if (
      JSON.stringify(strip(state.config)) !==
      JSON.stringify(strip(state.publishedConfig))
    )
      throw new HttpError(
        "Selesaikan atau batalkan draft Dekorasi Toko sebelum menerbitkan informasi toko.",
        409,
      );
    const saved = await executeAppearanceCommand({
      kind: "save",
      draftVersion: state.draftVersion,
      publishedVersion: state.publishedVersion,
      config: { ...state.config, identity },
    });
    const published = await executeAppearanceCommand({
      kind: "publish",
      draftVersion: saved.draftVersion,
      publishedVersion: saved.publishedVersion,
    });
    return ok({
      mailBrandPending: await mailBrandSyncPending().catch(() => true),
      identity: published.publishedConfig.identity,
      draftVersion: published.draftVersion,
      publishedVersion: published.publishedVersion,
    });
  });
}
