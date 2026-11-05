import { publicCampaign } from "@/modules/promotions/campaign-pricing";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await publicCampaign(), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
