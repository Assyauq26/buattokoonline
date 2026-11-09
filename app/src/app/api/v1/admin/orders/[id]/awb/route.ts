import { notFound } from "next/navigation";
import { createAwbPdf } from "@/modules/shipping/awb-pdf";
import { prisma } from "@/lib/prisma";
import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { historicJntConfig } from "@/modules/shipping/shipping-settings.service";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireBackofficeUser(PERMISSIONS.SHIPPING_READ);
  const { id } = await params;
  const size = new URL(request.url).searchParams.get("size") || "100x150";
  if (size !== "100x150" && size !== "75x150")
    return Response.json(
      { error: "Ukuran AWB tidak tersedia" },
      { status: 422 },
    );
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      address: true,
      shipment: true,
      jntShipmentRequest: true,
      items: true,
    },
  });
  if (
    !order?.address ||
    order.shipment?.provider !== "jnt" ||
    !!order.shipment?.cancelledAt ||
    order.jntShipmentRequest?.state !== "SUCCEEDED" ||
    !order.shipment.trackingNumber ||
    order.shipment.trackingNumber !== order.jntShipmentRequest.awb
  )
    notFound();
  const { config } = await historicJntConfig(order.jntCheckoutRevisionId);
  const sender = config.seller!.warehouse;
  const awb = order.shipment.trackingNumber;
  const routing = await prisma.auditLog.findFirst({
    where: {
      entity: "Order",
      entityId: id,
      action: { in: ["jnt.order.accepted", "jnt.order.routing.reconciled"] },
      meta: { path: ["awb"], equals: awb },
    },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  });
  const code = (routing?.meta as { routingCode?: unknown } | null)?.routingCode;
  const routingCode =
    typeof code === "string" && /^[A-Z0-9-]{1,64}$/i.test(code) ? code : null;
  try {
    const pdf = await createAwbPdf(
      {
        awb,
        service: order.shippingService || order.shipment.service || "—",
        orderNumber: order.orderNumber,
        routingCode,
        senderName: sender.name,
        senderPhone: sender.phone,
        senderAddress: sender.address,
        recipientName: order.address.recipientName,
        recipientPhone: order.address.phone,
        address: [
          order.address.line,
          order.address.village,
          order.address.district,
          order.address.city,
          order.address.province,
        ]
          .filter(Boolean)
          .join(", "),
        destination: [order.address.district, order.address.city]
          .filter(Boolean)
          .join(", "),
        weight: order.shippingWeightGram || 0,
        date: order.shipment.createdAt.toLocaleDateString("id-ID", {
          timeZone: "Asia/Jakarta",
        }),
        items: order.items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          variation: i.variantLabel || "",
        })),
      },
      size,
    );
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="awb-${awb.replace(/[^a-z0-9-]/gi, "")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Label terlalu panjang")
    )
      return Response.json(
        {
          error:
            "Data label terlalu panjang. Hubungi operator untuk menyiapkan label lengkap.",
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
}
