import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handle } from "@/lib/response";
import { getObject } from "@/lib/storage";
import { resolutionProof } from "@/modules/orders/resolution.service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(async () => {
    const u = await requireUser(),
      p = new URL(req.url).searchParams;
    const proof = await resolutionProof(
      z.string().uuid().parse(p.get("id")),
      { id: u.id, staff: u.isAdmin },
      z.enum(["transfer", "evidence"]).parse(p.get("kind")),
    );
    const { data } = await getObject(proof.path);
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": proof.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Content-Disposition": "inline",
      },
    });
  });
}
