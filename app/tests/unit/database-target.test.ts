import { describe, expect, it } from "vitest";
import { databaseTestTarget } from "../database-target";
const targets = {
  PAYMENT_EVIDENCE_TEST_DATABASE_URL:
    "postgresql://postgres@127.0.0.1:5432/hubify_payment_evidence_test",
  MANAGEMENT_TEST_DATABASE_URL:
    "postgresql://postgres@127.0.0.1:5432/management_v130_test",
  PRODUCT_EDITOR_TEST_DATABASE_URL:
    "postgresql://postgres@127.0.0.1:5432/product_editor_test",
  PROMOTIONS_TEST_DATABASE_URL:
    "postgresql://postgres@127.0.0.1:5557/hubify_promotions_test",
};
describe("isolated full-suite database routing", () => {
  it("keeps editor, promotions and management suites on separate databases", () => {
    expect(
      databaseTestTarget("/tests/database/payment-evidence.test.ts", targets),
    ).toBe(targets.PAYMENT_EVIDENCE_TEST_DATABASE_URL);
    expect(databaseTestTarget("/tests/database/blu-transfer-test.test.ts", targets)).toBe(targets.PAYMENT_EVIDENCE_TEST_DATABASE_URL);
    expect(
      databaseTestTarget(
        "/tests/database/promotions-refactor.test.ts",
        targets,
      ),
    ).toBe(targets.PROMOTIONS_TEST_DATABASE_URL);
    expect(
      databaseTestTarget(
        "/tests/database/product-editor-remediation.test.ts",
        targets,
      ),
    ).toBe(targets.PRODUCT_EDITOR_TEST_DATABASE_URL);
    expect(
      databaseTestTarget("/tests/database/order-resolution.test.ts", targets),
    ).toBe(targets.MANAGEMENT_TEST_DATABASE_URL);
  });
  it("refuses remote hosts, unexpected ports, production names and protocols", () => {
    for (const bad of [
      "postgresql://postgres@remote.test:5557/hubify_promotions_test",
      "postgresql://postgres@127.0.0.1:5432/hubify_promotions_test",
      "postgresql://postgres@127.0.0.1:5557/store",
      "https://127.0.0.1:5557/hubify_promotions_test",
    ]) {
      expect(() =>
        databaseTestTarget("/promotions-refactor.test.ts", {
          ...targets,
          PROMOTIONS_TEST_DATABASE_URL: bad,
        }),
      ).toThrow();
    }
  });
  it("refuses missing profile configuration", () => {
    expect(() =>
      databaseTestTarget("/product-editor-remediation.test.ts", {}),
    ).toThrow("Missing isolated");
  });
});
