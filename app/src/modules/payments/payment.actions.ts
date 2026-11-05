"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { MAX_PROOF_BYTES } from "./payment-proof-validation";
import { uploadPaymentProof } from "./payment-proof-upload";

const fields = z.object({
  orderId: z.string().min(1),
  senderBank: z.string().min(1, "Bank pengirim wajib diisi"),
  senderName: z.string().min(2, "Nama pengirim wajib diisi"),
  amount: z.coerce.number().int().positive("Nominal tidak valid"),
  transferDate: z.string().min(1, "Tanggal transfer wajib diisi"),
  note: z.string().optional(),
});

export async function submitProofAction(_prev: unknown, formData: FormData) {
  const parsed = fields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  if (formData.getAll("proof").length !== 1) return { ok: false as const, error: "Unggah satu bukti transfer" };
  const file = formData.get("proof");
  if (!(file instanceof File) || !file.size) return { ok: false as const, error: "Bukti transfer wajib diunggah" };
  if (file.size > MAX_PROOF_BYTES) return { ok: false as const, error: "Ukuran file maksimal 4MB" };
  return runAction(async () => {
    const user = await requireUser();
    await uploadPaymentProof(user.id, parsed.data, new Uint8Array(await file.arrayBuffer()), file.type);
    revalidatePath("/orders");
    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath(`/checkout/payment/${parsed.data.orderId}`);
    return { submitted: true };
  });
}
