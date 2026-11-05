import { assertSameOrigin } from "@/lib/mutation-origin";
import { z } from "zod";
import { ok, fail, handle } from "@/lib/response";
import { requireUser } from "@/lib/auth/session";
import { readUploadFormData } from "@/lib/upload-body";
import { MAX_PROOF_BYTES } from "@/modules/payments/payment-proof-validation";
import { uploadPaymentProof } from "@/modules/payments/payment-proof-upload";

export const dynamic = "force-dynamic";

const fields = z.object({
  orderId: z.string().min(1),
  senderBank: z.string().min(1),
  senderName: z.string().min(1),
  amount: z.coerce.number().int().positive(),
  transferDate: z.string().min(1),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await readUploadFormData(req, MAX_PROOF_BYTES + 128 * 1024);
    const parsed = fields.parse(Object.fromEntries(form));
    if (form.getAll("proof").length !== 1) return fail("Unggah satu bukti transfer", 422);
    const file = form.get("proof");
    if (!(file instanceof File) || !file.size) return fail("Bukti transfer wajib", 400);
    if (file.size > MAX_PROOF_BYTES) return fail("Ukuran maksimal 4MB", 413);
    const order = await uploadPaymentProof(user.id, parsed, new Uint8Array(await file.arrayBuffer()), file.type);
    return ok(order, 201);
  });
}
