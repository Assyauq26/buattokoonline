import { describe, expect, it } from "vitest";
import { MAX_PROOF_BYTES, validatePaymentProof } from "@/modules/payments/payment-proof-validation";

const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
const jpg = Uint8Array.from([255,216,255,224,0,16,74,70,73,70]);
const webp = new TextEncoder().encode("RIFF1234WEBP");
const pdf = new TextEncoder().encode("%PDF-1.7\nmock");

describe("payment proof magic validation", () => {
  it.each([
    ["image/png",png,"png"],
    ["image/jpeg",jpg,"jpg"],
    ["image/webp",webp,"webp"],
    ["application/pdf",pdf,"pdf"],
  ])("accepts correctly tagged %s files", (mime,bytes,ext) => {
    expect(validatePaymentProof(bytes,mime)).toBe(ext);
  });
  it("rejects mismatched MIME even when bytes resemble a file", () => {
    expect(() => validatePaymentProof(png,"application/pdf")).toThrow();
    expect(() => validatePaymentProof(pdf,"image/png")).toThrow();
  });
  it("blocks unsupported extension, empty and oversized content", () => {
    expect(() => validatePaymentProof(png,"image/svg+xml")).toThrow();
    expect(() => validatePaymentProof(new Uint8Array(),"image/png")).toThrow();
    expect(MAX_PROOF_BYTES).toBe(4 * 1024 * 1024);
    expect(() => validatePaymentProof(new Uint8Array(MAX_PROOF_BYTES + 1),"image/jpeg")).toThrow();
    const atLimit = new Uint8Array(MAX_PROOF_BYTES);
    atLimit.set([255,216,255,224]);
    expect(validatePaymentProof(atLimit, "image/jpeg")).toBe("jpg");
  });
});
