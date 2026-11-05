"use server";

import { z } from "zod";
import { HttpError } from "@/lib/response";
import { CATALOG_CACHE_TAG } from "@/modules/catalog/catalog-cache";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { createReview, askQuestion } from "./reviews.service";

export async function createReviewAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const user = await requireUser();
    const id = z
      .string()
      .min(1)
      .max(100)
      .safeParse(formData.get("orderItemId"));
    if (!id.success) throw new HttpError("Item pesanan tidak valid", 422);
    const result = await createReview(user.id, id.data, {
      rating: formData.get("rating"),
      title: formData.get("title") || undefined,
      body: formData.get("body"),
    });
    revalidatePath(`/orders/${result.orderId}`);
    revalidatePath(`/product/${result.slug}`);
    revalidateTag(CATALOG_CACHE_TAG);
    return { id: result.id };
  });
}

const qnaSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),
  body: z.string().min(3, "Pertanyaan minimal 3 karakter"),
});

export async function askQuestionAction(_prev: unknown, formData: FormData) {
  const parsed = qnaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false as const, error: parsed.error.issues[0].message };
  const res = await runAction(async () => {
    const user = await requireUser();
    await askQuestion(user.id, parsed.data.productId, parsed.data.body);
    return { ok: true };
  });
  revalidatePath(`/product/${parsed.data.slug}`);
  return res;
}
