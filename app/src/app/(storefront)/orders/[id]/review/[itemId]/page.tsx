import Link from "@/components/ui/navigation";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/response";
import { reviewableOrderItems } from "@/modules/reviews/reviews.service";
import { ReviewForm } from "@/components/storefront/review-form";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Beri Ulasan",
  robots: { index: false, follow: false },
};
export default async function OrderReviewPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/login?redirectTo=${encodeURIComponent(`/orders/${id}/review/${itemId}`)}`,
    );
  let items;
  try {
    items = await reviewableOrderItems(user.id, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  const item = items.find((i) => i.id === itemId);
  if (!item) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href={`/orders/${id}`} className="text-sm font-semibold">
        Kembali ke pesanan
      </Link>
      <h1 className="font-display text-2xl font-bold">Beri Ulasan</h1>
      <section className="order-review-entry space-y-5">
        <div className="flex gap-3">
          <div className="purchase-thumbnail">
            {item.imageUrl && (
              <Image
                src={item.imageUrl}
                alt={item.productName}
                fill
                sizes="76px"
                className="object-cover"
                unoptimized={item.imageUrl.startsWith(
                  "/api/v1/product-images/",
                )}
              />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="break-words font-semibold">{item.productName}</h2>
            <p className="text-sm">{item.variantLabel}</p>
          </div>
        </div>
        {item.reviewed ? (
          <p role="status">Sudah Diulas</p>
        ) : item.eligible ? (
          <ReviewForm orderItemId={item.id} />
        ) : (
          <p>
            Ulasan hanya tersedia setelah pesanan lunas dan diterima, tanpa
            proses refund aktif.
          </p>
        )}
      </section>
    </div>
  );
}
