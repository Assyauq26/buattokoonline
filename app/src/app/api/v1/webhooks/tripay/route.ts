import { acknowledgeWebhook } from "@/modules/payments/webhook";
export const dynamic = "force-dynamic";
export const POST = (req: Request) => acknowledgeWebhook("tripay", req);
