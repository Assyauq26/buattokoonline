import { flowWhere } from "@/modules/orders/flow-state";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { CatalogActor } from "@/modules/catalog/product-management.validation";

export async function getSellerDashboard(actor: CatalogActor) {
  if (!actor.isAdmin) throw new HttpError("Akses backoffice diperlukan", 403);
  const has = (p: string) => actor.permissions.includes(p);
  const [products, inventory, orders, sales, recent] = await Promise.all([
    has(PERMISSIONS.PRODUCT_READ)
      ? prisma.product.groupBy({ by: ["status"], _count: { _all: true } })
      : null,
    has(PERMISSIONS.INVENTORY_READ)
      ? prisma.inventory.aggregate({
          _sum: { onHand: true, reserved: true },
          _count: { _all: true },
        })
      : null,
    has(PERMISSIONS.ORDER_READ)
      ? Promise.all(
          ["all", "payment", "ready", "packing", "pickup", "return"].map(
            (key) => prisma.order.count({ where: flowWhere(key) }),
          ),
        )
      : null,
    has(PERMISSIONS.PAYMENT_READ) && has(PERMISSIONS.ORDER_READ)
      ? prisma.order.aggregate({
          where: { paymentStatus: "PAID" },
          _sum: { total: true },
          _count: { _all: true },
        })
      : null,
    has(PERMISSIONS.ORDER_READ)
      ? prisma.order.findMany({
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            shipment: {
              select: {
                status: true,
                carrierCondition: true,
                cancelledAt: true,
              },
            },
            jntShipmentRequest: {
              select: { state: true, awb: true, errorCode: true },
            },
            total: true,
            user: { select: { name: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 5,
        })
      : null,
  ]);
  return {
    products: products
      ? {
          total: products.reduce((n, x) => n + x._count._all, 0),
          published:
            products.find((x) => x.status === "PUBLISHED")?._count._all ?? 0,
          drafts: products.find((x) => x.status === "DRAFT")?._count._all ?? 0,
          archived:
            products.find((x) => x.status === "ARCHIVED")?._count._all ?? 0,
        }
      : null,
    inventory: inventory
      ? {
          onHand: inventory._sum.onHand ?? 0,
          reserved: inventory._sum.reserved ?? 0,
          available:
            (inventory._sum.onHand ?? 0) - (inventory._sum.reserved ?? 0),
          variants: inventory._count._all,
        }
      : null,
    orders: orders
      ? {
          total: orders[0],
          pending: orders[1],
          processing: orders[2] + orders[3] + orders[4],
          ready: orders[2],
          packing: orders[3],
          pickup: orders[4],
          returns: orders[5],
        }
      : null,
    sales: sales
      ? { amount: sales._sum.total ?? 0, count: sales._count._all }
      : null,
    recent,
  };
}
