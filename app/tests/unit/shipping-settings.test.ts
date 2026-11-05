import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { flatShippingRate, manualShippingCost } from "@/modules/shipping/shipping-settings-input";
import { isPublicAddress } from "@/infrastructure/shipping/jnt/pinned-https";
import { validateEndpoint } from "@/infrastructure/shipping/jnt/official-config";
import { issueShippingQuote, verifyShippingQuote } from "@/modules/checkout/shipping-quote";
import { parseMappingFile } from "@/infrastructure/shipping/jnt/mapping-file";
import { inspectMapping } from "@/infrastructure/shipping/jnt/mapping-import";
import { readFileSync } from "node:fs";

afterEach(() => vi.unstubAllEnvs());

describe("single-store shipping settings", () => {
  it("accepts only bounded integer rupiah and quotes free shipping explicitly", () => {
    vi.stubEnv("JWT_SECRET", "quote-key-".repeat(5));
    for (const value of [-1, 1.5, "100", 100_000_001, null, Infinity]) expect(manualShippingCost.safeParse(value).success).toBe(false);
    for (const cost of [0, 12500, 100_000_000]) {
      const rate = flatShippingRate(cost);
      const quote = issueShippingQuote("old-settings", rate);
      expect(verifyShippingQuote(quote.quoteToken, "old-settings", rate).cost).toBe(cost);
      expect(() => verifyShippingQuote(quote.quoteToken, "new-settings", rate)).toThrow();
    }
  });

  it("blocks private, metadata, mapped IPv4 and reserved DNS answers", () => {
    for (const ip of ["localhost", "127.0.0.1", "169.254.169.254", "10.0.0.1", "100.64.0.1", "192.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "64:ff9b::a00:1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
    for (const url of ["https://localhost/jandt_track/inquiry.action", "https://partner-track.jet.co.id.evil.example/jandt_track/inquiry.action",
      "https://partner-track.jet.co.id/jandt_track/inquiry.action?redirect=https://169.254.169.254",
      "https://private@partner-track.jet.co.id/jandt_track/inquiry.action", "http://partner-track.jet.co.id/jandt_track/inquiry.action"]) {
      expect(() => validateEndpoint("tariff", url, "production")).toThrow();
    }
  });

  it("previews a workbook with custom headers and rejects disguised or oversized files", async () => {
    const file = readFileSync("tests/fixtures/jnt-synthetic-mapping.xlsx");
    const workbook = await parseMappingFile("fixture.xlsx", file);
    expect(workbook.sheets).toEqual(["Synthetic", "Formula"]);
    expect(workbook.rows[0].cells).toEqual(["Custom Province", "Synthetic City"]);
    await expect(parseMappingFile("fixture.xlsx", file, "Formula")).rejects.toThrow(/Formula/);
    const oversizedZip = Buffer.from(file);
    const entry = oversizedZip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(entry).toBeGreaterThan(0);
    oversizedZip.writeUInt32LE(16 * 1024 * 1024 + 1, entry + 24);
    await expect(parseMappingFile("fixture.xlsx", oversizedZip)).rejects.toThrow();
    await expect(parseMappingFile("fake.xlsx", Buffer.from("foo"))).rejects.toThrow();
    await expect(parseMappingFile("fake.csv", Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toThrow(/2 MiB/);
  });

  it("preserves five separate codes, detects duplicates and rejects missing or unmatched data", async () => {
    const columns = { district: 0, province: 1, city: 2, districtCode: 3, originCityCode: 4, sendSiteCode: 5, destAreaCode: 6, receiverArea: 7, destinationCityCode: 8 };
    const header = "Distrik;Propinsi;Kab;Internal;OrderAsal;Asal;Tujuan;AreaOrder;KotaOrder\n";
    const row = "TEBET;DKI JAKARTA;KOTA ADM. JAKARTA SELATAN;31.74.01;AAA;SYNTHETIC ORIGIN;SYNTHETIC DEST;ZX0001;BBB";
    const actual = JSON.parse((await import("node:zlib")).gunzipSync(readFileSync("src/modules/regions/data/snapshot.json.gz")).toString());
    const p = actual.provinces.data[0], c = actual["regencies/" + p.code].data[0], d = actual["districts/" + c.code].data[0];
    const codes = row.split(";").slice(4);
    const valid = [d.name, p.name, c.name, d.code, ...codes].join(";");
    const inspect = (rows: string[]) => inspectMapping("fixture.csv", Buffer.from(header + rows.join("\n")), { headerRow: 1, columns, delimiter: ";" });
    const one = await inspect([valid]);
    expect(one.report.valid).toBe(1);
    expect(one.rows[0]).toMatchObject({ sendSiteCode: "SYNTHETIC ORIGIN", originCityCode: "AAA", destAreaCode: "SYNTHETIC DEST", jntCityCode: "BBB", jntAreaCode: "ZX0001" });
    expect((await inspect([valid, valid])).report).toMatchObject({ valid: 0, duplicate: 2 });
    expect((await inspect([valid.replace("SYNTHETIC DEST", "")])).report.invalid).toBe(1);
    expect((await inspect([valid.replace(d.code, "99.99.99")])).report.unmatched).toBe(1);
  });
});
