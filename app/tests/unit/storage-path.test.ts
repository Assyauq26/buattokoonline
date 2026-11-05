import { describe, expect, it } from "vitest";
import { resolveStorageObject } from "@/lib/storage-path";

const uuid = "12345678-1234-1234-1234-123456789abc";
const app = "store";

describe("Supabase object routing", () => {
  it("maps an internal product image path to only the product bucket", () => {
    expect(resolveStorageObject(`${app}/product-images/p123/${uuid}.png`, app)).toEqual({
      bucket: "product-images",
      key: `${app}/product-images/p123/${uuid}.png`,
      extension: "png",
    });
  });
  it("maps private payment proofs to the private bucket", () => {
    expect(resolveStorageObject(`${app}/payment-proofs/u123/${uuid}.pdf`, app).bucket).toBe("payment-proofs");
  });
  it.each([
    "../payment-proofs/u1/test.pdf",
    `other/payment-proofs/u1/${uuid}.pdf`,
    `${app}/product-images/p1/${uuid}.pdf`,
    `${app}/payment-proofs/../${uuid}.pdf`,
    `${app}/product-images/p1/%2e%2e/${uuid}.jpg`,
    `${app}/product-images/p1/${uuid}.svg`,
    `${app}/product-images/p1/random.jpg`,
    `https://example.com/${app}/payment-proofs/u1/${uuid}.pdf`,
  ])("rejects unsafe or arbitrary storage object: %s", path => {
    expect(() => resolveStorageObject(path, app)).toThrow();
  });
  it("rejects an unsafe STORAGE_APP_NAME", () => {
    expect(() => resolveStorageObject(`${app}/product-images/p1/${uuid}.png`, "../other")).toThrow();
  });
});
