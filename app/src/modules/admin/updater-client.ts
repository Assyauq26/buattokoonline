import "server-only";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { verifySessionClaims } from "@/lib/auth/jwt";
import { HttpError } from "@/lib/response";

export async function updaterCommand(input: {
  action: "status" | "check" | "start";
  sha?: string;
  requestKey?: string;
}) {
  const user = await getCurrentUser(false);
  if (!user?.roles.includes("Admin"))
    throw new HttpError(
      "Hanya pemilik toko yang dapat mengelola pembaruan.",
      403,
    );
  const cookie = (await cookies()).get(
    process.env.AUTH_COOKIE_NAME ?? "store_session",
  )?.value;
  const session = cookie ? await verifySessionClaims(cookie) : null;
  if (!session || session.sub !== user.id)
    throw new HttpError("Silakan masuk kembali.", 401);
  if (
    process.env.STORE_UPDATER_ENABLED !== "1" ||
    !process.env.STORE_INSTALLATION_ID
  )
    throw new HttpError("Layanan update belum dipasang untuk toko ini.", 503);
  try {
    const token = (await readFile("/run/store-updater-token", "utf8")).trim();
    const body = JSON.stringify({
      ...input,
      installation: process.env.STORE_INSTALLATION_ID,
      actor: user.id,
      sessionVersion: session.version,
      sessionHash: session.tokenHash,
      sessionExpires: Math.floor(session.expiresAt.getTime() / 1000),
    });
    return await new Promise<unknown>((resolve, reject) => {
      const req = request(
        {
          socketPath: "/run/store-updater/control.sock",
          path: "/command",
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const parts: Buffer[] = [];
          let size = 0;
          res.on("data", (part) => {
            size += part.length;
            if (size > 128 * 1024) res.destroy(new Error("response_size"));
            else parts.push(part);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              const value = JSON.parse(Buffer.concat(parts).toString());
              if (res.statusCode !== 200) {
                const messages: Record<string, string> = {
                  check_cooldown: "Tunggu sebentar sebelum memeriksa lagi.",
                  rate_limited:
                    "Terlalu banyak permintaan. Coba lagi sebentar.",
                  catalog_unavailable:
                    "Daftar rilis belum dapat diverifikasi. Coba lagi nanti.",
                  release_not_available:
                    "Rilis berubah atau tidak tersedia. Periksa pembaruan kembali.",
                  access_denied: "Anda tidak memiliki akses pembaruan.",
                  session_expired: "Silakan masuk kembali.",
                };
                reject(
                  new HttpError(
                    messages[value.error] ??
                      "Layanan update belum dapat memproses permintaan.",
                    409,
                  ),
                );
              } else resolve(value);
            } catch {
              reject(new Error("invalid_response"));
            }
          });
        },
      );
      req.setTimeout(12000, () => req.destroy(new Error("timeout")));
      req.on("error", reject);
      req.end(body);
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      "Layanan update belum dapat dihubungi. Proses yang sudah dimulai tetap berjalan.",
      503,
    );
  }
}
