export const MIDTRANS_METHOD = "midtrans_snap";
export const MIDTRANS_WINDOW_MS = 20 * 60_000;
export const MIDTRANS_TERMINAL = ["deny", "failure", "cancel", "expire"];
export function rupiah(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})(\.00)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}
export function urls(environment: string) {
  if (!["production", "sandbox"].includes(environment)) throw new Error("Environment Midtrans tidak valid");
  const sandbox = environment === "sandbox";
  return { api: sandbox ? "https://api.sandbox.midtrans.com" : "https://api.midtrans.com",
    snap: sandbox ? "https://app.sandbox.midtrans.com" : "https://app.midtrans.com" };
}
