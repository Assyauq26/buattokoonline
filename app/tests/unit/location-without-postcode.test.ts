import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/infrastructure/shipping/jnt/verified-mapping", () => ({
  findVerifiedJntDistrict: vi.fn().mockResolvedValue({ province: "ACEH", city: "KAB. ACEH BARAT", district: "JOHAN PAHLAWAN", approvedAt: new Date(0) }),
}));
import { addressSchema } from "@/modules/regions/region.validation";
import { validateJntLocation } from "@/infrastructure/shipping/jnt/mapping-regions";
import { validateLocation } from "@/modules/regions/region.service";

describe("checkout address without customer-entered postcode", () => {
  const address = { provinceCode: "ACEH", cityCode: "KAB. ACEH BARAT", districtCode: "JNT-MEH001", villageCode: "", village: "Ujong Baroh", postalCode: "", recipientName: "Penerima", phone: "081234567890", line: "Jalan contoh nomor 1" };
  it("preserves the entered village while resolving J&T parents from mapping", async () => {
    const parsed = addressSchema.parse(address);
    expect(await validateJntLocation(parsed, "active")).toMatchObject({ village: "Ujong Baroh", postalCode: "", district: "JOHAN PAHLAWAN" });
    await expect(validateJntLocation({ ...parsed, cityCode: "Wrong" }, "active")).rejects.toThrow();
  });
  it("requires a village for new J&T orders and rejects malformed supplied postcodes", () => {
    expect(addressSchema.safeParse({ ...address, village: "  " }).success).toBe(false);
    expect(addressSchema.safeParse({ ...address, postalCode: "abc" }).success).toBe(false);
  });
  it("resolves an available manual-region postcode without asking the buyer", async () => {
    vi.stubEnv("REGION_DATA_MODE", "snapshot");
    try {
      expect(await validateLocation({ provinceCode: "31", cityCode: "31.71", districtCode: "31.71.01", villageCode: "31.71.01.1001", postalCode: "" })).toMatchObject({ village: "Gambir", postalCode: "10110" });
    } finally { vi.unstubAllEnvs(); }
  });
});
