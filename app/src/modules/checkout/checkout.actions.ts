"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runAction } from "@/lib/action";
import { selectedCartLines, checkoutLinesSchema, checkoutQuoteSchema } from "./checkout.validation";
import { checkoutIntentId } from "./checkout-intent";
import { createOrder } from "./checkout.service";
import { addressSchema } from "@/modules/regions/region.validation";
import { shippingCourierSchema } from "@/modules/shipping/shipping-settings-input";

const schema = z.object({
  recipientName: z.string().min(2),
  phone: z.string().min(6),
  line: z.string().min(4),
  city: z.string().min(2),
  province: z.string().min(2),
  postalCode: z.string().default(""),
  village: z.string().trim().max(150).optional(),
  courier: shippingCourierSchema,
  service: z.string().min(1),
  shippingCost: z.coerce.number().int().nonnegative(),
  quoteToken: z.string().min(1).max(4096),
  provinceCode: z.string(), cityCode: z.string(), districtCode: z.string(), villageCode: z.string(),
  bankAccountId: z.string().max(100),
  paymentMethod: z.enum(["manual", "midtrans"]).default("manual"),
  paymentEvidenceSourceId: z.preprocess(v => v === "" ? undefined : v, z.string().min(1).max(100).optional()),
  codeConsent: z.preprocess(v => v === "on" || v === "true", z.boolean()),
  couponCode: z.string().optional(),
  note: z.string().optional(),
  requestId: z.string().uuid(),
  intentId: z.preprocess(value => value === "" ? undefined : value, checkoutIntentId.optional()),
  selectedIds: z.string().transform(s=>s.split(",")).pipe(selectedCartLines).optional(),
  expectedLines: z.string().transform((value, ctx) => { try { return JSON.parse(value) as unknown; } catch { ctx.addIssue({ code: "custom", message: "Konfirmasi harga tidak valid" }); return z.NEVER; } }).pipe(checkoutLinesSchema),
  expectedQuote: z.string().transform((value, ctx) => { try { return JSON.parse(value) as unknown; } catch { ctx.addIssue({ code: "custom", message: "Ringkasan total tidak valid" }); return z.NEVER; } }).pipe(checkoutQuoteSchema),
});

export async function createOrderAction(_prev: unknown, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: "Lengkapi data pengiriman dengan benar" };
  }
  const d = parsed.data;
  const res = await runAction(async () => {
    const user = await requireUser();
    const order = await createOrder(user.id, {
      address: {
        ...addressSchema.parse(d),
        recipientName: d.recipientName,
        phone: d.phone,
        line: d.line,
        city: d.city,
        province: d.province,
        postalCode: d.postalCode,
      },
      shipping: { courier: d.courier, service: d.service, cost: d.shippingCost, quoteToken: d.quoteToken },
      bankAccountId: d.bankAccountId,
      paymentMethod: d.paymentMethod,
      paymentEvidenceSourceId: d.paymentEvidenceSourceId,
      codeConsent: d.codeConsent,
      couponCode: d.couponCode,
      note: d.note,
      expectedLines: d.expectedLines,
      expectedQuote: d.expectedQuote,
      requestId: d.requestId,
      intentId: d.intentId,
      selectedIds: d.selectedIds,
    });
    return order.id;
  });
  if (!res.ok) return res;
  revalidatePath("/orders");
  redirect(`/checkout/payment/${res.data}`);
}
