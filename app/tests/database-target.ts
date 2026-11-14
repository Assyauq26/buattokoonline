/** Routing for the complete CI suite; individual database guards remain intact. */
export function databaseTestTarget(
  file: string,
  env: Record<string, string | undefined>,
) {
  const profile = (file.endsWith("/payment-evidence.test.ts") || file.endsWith("/blu-transfer-test.test.ts") || file.endsWith("/blu-signature.test.ts"))
    ? {
        key: "PAYMENT_EVIDENCE_TEST_DATABASE_URL",
        port: "5432",
        database: "/hubify_payment_evidence_test",
      }
    : file.endsWith("/promotions-refactor.test.ts")
      ? {
          key: "PROMOTIONS_TEST_DATABASE_URL",
          port: "5557",
          database: "/hubify_promotions_test",
        }
      : file.endsWith("/product-editor-remediation.test.ts")
        ? {
            key: "PRODUCT_EDITOR_TEST_DATABASE_URL",
            port: "5432",
            database: "/product_editor_test",
          }
        : {
            key: "MANAGEMENT_TEST_DATABASE_URL",
            port: "5432",
            database: "/management_v130_test",
          };
  const target = env[profile.key];
  if (!target)
    throw new Error("Missing isolated database profile: " + profile.key);
  const url = new URL(target);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== profile.port ||
    url.pathname !== profile.database
  )
    throw new Error(
      "Database profile must use the exact isolated local target",
    );
  return target;
}
