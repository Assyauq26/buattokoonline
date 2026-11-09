// @vitest-environment jsdom
import { it, expect } from "vitest";
import { normalizeWhatsApp, storeChatUrl } from "@/lib/store-contact";
import { appearanceSchema, makeDefault } from "@/modules/appearance/schema";
it("normalizes local and international phones without double prefixes", () => {
  for (const v of ["081234567890", "+62 812-3456-7890", "006281234567890"])
    expect(normalizeWhatsApp(v)).toBe("6281234567890");
  for (const v of [
    "+62 081234567890",
    "626281234567890",
    "javascript:1",
    "123",
    "",
  ])
    expect(normalizeWhatsApp(v)).toBeNull();
});
it("encodes only public product URL and selected attributes in a fixed WhatsApp destination", () => {
  const url = new URL(
    storeChatUrl(
      "081234567890",
      { name: "Produk & Model", slug: "hello world" },
      2,
      ["Biru", "XL"],
    )!,
  );
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toContain("Variasi: Biru • XL");
  expect(url.searchParams.get("text")).toContain("Jumlah: 2");
  expect(url.searchParams.get("text")).not.toMatch(/token=|admin/);
});
it("rejects chat activation without valid public contact and defaults legacy configs safely", () => {
  const v = makeDefault();
  expect(v.identity.showWhatsApp).toBe(false);
  expect(
    appearanceSchema.safeParse({
      ...v,
      identity: { ...v.identity, showWhatsApp: true, whatsapp: "" },
    }).success,
  ).toBe(false);
});
