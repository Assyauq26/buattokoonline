/** One trusted origin per installation; never taken from request headers. */
export function storeOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  try {
    const url = new URL(env.APP_ORIGIN || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new Error("APP_ORIGIN must be the store HTTPS origin (HTTP only on loopback)"); }
}
