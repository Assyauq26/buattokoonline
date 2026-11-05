import { it, expect } from "vitest";
import { uploadRecoveryCandidate } from "@/components/admin/variation-upload-recovery";
import type { ProductEditorData } from "@/modules/catalog/product-management.service";
const before = {
  id: "p",
  name: "Produk asli",
  updatedAt: "old",
  images: [],
  optionImages: [],
  variants: [],
  optionGroups: [],
  optionsEnabled: false,
} as unknown as ProductEditorData;
const image = {
  id: "photo",
  url: "/api/v1/product-images/photo?object=owned-path",
  alt: "Dummy",
};
const current = () => ({ ...before, updatedAt: "new", optionImages: [image] });
it("can reconcile exactly one attached upload without overwriting a form draft", () => {
  expect(uploadRecoveryCandidate(before, current())).toEqual(image);
  expect(before.name).toBe("Produk asli");
});
it.each(["name", "basePrice", "status", "variants", "optionGroups"])(
  "rejects concurrent %s changes instead of adopting their version",
  (key) => {
    expect(
      uploadRecoveryCandidate(before, {
        ...current(),
        [key]: "external-change",
      } as unknown as ProductEditorData),
    ).toBeUndefined();
  },
);
it("rejects multiple possible uploads, replaced metadata and unrelated identity", () => {
  expect(
    uploadRecoveryCandidate(before, {
      ...current(),
      optionImages: [image, { ...image, id: "second" }],
    }),
  ).toBeUndefined();
  expect(
    uploadRecoveryCandidate(before, { ...current(), id: "foreign" }),
  ).toBeUndefined();
  expect(
    uploadRecoveryCandidate(before, { ...current(), images: [image] }),
  ).toBeUndefined();
});
it("never fetches an external or arbitrary storage URL as upload recovery", () => {
  expect(
    uploadRecoveryCandidate(before, {
      ...current(),
      optionImages: [{ ...image, url: "https://foreign.example.test/image" }],
    }),
  ).toBeUndefined();
});
