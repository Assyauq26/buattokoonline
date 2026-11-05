import { ok, handle } from "@/lib/response";
import { listCategories } from "@/modules/catalog/catalog.service";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listCategories()));
}
