import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/response";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assertStaffPermission } from "@/modules/orders/transaction-locks";
import { writeAudit } from "@/modules/audit/audit.service";

/** Keep transaction and inventory history; foreign keys remain the final safety net. */
export async function deleteManagedProduct(actorId: string, id: string, revision: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await assertStaffPermission(tx, actorId, PERMISSIONS.PRODUCT_DELETE);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`);
        const product = await tx.product.findUnique({ where: { id }, include: {
          images: true,
          variants: { include: { inventory: true, _count: { select: { orderItems: true, movements: true } } } },
          _count: { select: { reviews: true, questions: true, flashCampaignItems: true } },
        } });
        if (!product) return { outcome: "deleted" as const, message: "Produk sudah dihapus." };
        const history = product.variants.some(v => v._count.orderItems || v._count.movements || v.inventory?.reserved)
          || product._count.reviews || product._count.questions || product._count.flashCampaignItems;
        if (history && product.status === "ARCHIVED")
          return { outcome: "archived" as const, message: "Produk diarsipkan. Riwayat transaksi, stok, dan promosi tetap disimpan." };
        if (product.updatedAt.toISOString() !== revision) throw new HttpError("Produk sudah berubah. Muat ulang sebelum menghapus.", 409);
        if (history) {
          await tx.product.update({ where: { id }, data: { status: "ARCHIVED" } });
          await writeAudit({ userId: actorId, action: "product.delete.archived", entity: "Product", entityId: id }, tx);
          return { outcome: "archived" as const, message: "Produk diarsipkan karena memiliki riwayat. Data transaksi tetap utuh." };
        }
        // Delete dependent selections before their RESTRICT-protected values.
        await tx.productVariantOptionValue.deleteMany({ where: { productId: id } });
        await tx.productOptionValue.deleteMany({ where: { productId: id } });
        await tx.product.delete({ where: { id } });
        for (const image of product.images) {
          if (await tx.productImage.count({ where: { url: image.url } }) || await tx.orderItem.count({ where: { imageUrl: image.url } })) continue;
          const queued = await tx.stagedProductMedia.updateMany({ where: { id: image.id, productId: id }, data: { productId: null, cancelledAt: new Date(), expiresAt: new Date() } });
          if (!queued.count) {
            // Queue legacy files only when both URL and owned object path match this image exactly.
            // External or shared media must never be removed by product deletion.
            const url = new URL(image.url, "http://localhost");
            const objectPath = url.searchParams.get("object") || "";
            const owned = [ `store/product-images/${id}/${image.id}`, `store/product-images/staged-${image.id}/${image.id}` ];
            if (url.origin === "http://localhost" && url.pathname === `/api/v1/product-images/${image.id}` &&
                owned.some(prefix => ["webp", "png", "jpg", "jpeg"].some(ext => objectPath === `${prefix}.${ext}`))) {
              // Cancelled tombstones are cleanup-only, never valid upload sessions or ready media.
              await tx.stagedProductMedia.upsert({ where: { id: image.id }, update: {}, create: {
                id: image.id, actorId, sessionHash: "0".repeat(64), contentHash: "0".repeat(64), objectPath,
                mime: "application/octet-stream", purpose: "gallery", ready: false, productId: null, cancelledAt: new Date(), expiresAt: new Date()
              } });
            }
          }
        }
        await writeAudit({ userId: actorId, action: "product.delete", entity: "Product", entityId: id }, tx);
        // Object storage is cleaned by the staged-media collector, never before commit.
        return { outcome: "deleted" as const, message: "Produk berhasil dihapus." };
      }, { isolationLevel: "Serializable", timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const conflict = error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)));
        if (conflict && attempt < 2) continue;
        if (conflict || error.code === "P2003") throw new HttpError("Produk sedang digunakan atau berubah. Muat ulang lalu coba lagi.", 409);
      }
      throw error;
    }
  }
}
