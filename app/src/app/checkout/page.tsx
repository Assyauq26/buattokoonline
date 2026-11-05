import { cookies } from "next/headers";
import { CHECKOUT_INTENT_COOKIE, checkoutIntentId, claimCheckoutIntent, getIntentCheckoutView } from "@/modules/checkout/checkout-intent";
import { HttpError } from "@/lib/response";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartView } from "@/modules/cart/cart.service";
import { listActiveBankAccounts } from "@/modules/payments/payments.service";
import { prisma } from "@/lib/prisma";
import { CheckoutClient } from "@/components/storefront/checkout-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const { intent } = await searchParams;
  if (intent !== undefined && !checkoutIntentId.safeParse(intent).success) {
    return <p role="alert">Checkout tidak valid. Silakan pilih produk kembali.</p>;
  }
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(intent ? `/checkout?intent=${intent}` : "/checkout")}`);
  let directView: Awaited<ReturnType<typeof getIntentCheckoutView>> | undefined;
  if (intent) {
    try {
      await claimCheckoutIntent(intent, user.id, (await cookies()).get(CHECKOUT_INTENT_COOKIE)?.value);
      directView = await getIntentCheckoutView(intent, user.id);
    }
    catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return <p role="alert">{error.message} <a href="/shop">Kembali ke produk</a></p>;
    }
  }

  const [cart, banks, customer] = await Promise.all([
    intent ? directView! : getCartView(user.id),
    listActiveBankAccounts(),
    prisma.customer.findUnique({
      where: { userId: user.id },
      include: { addresses: { where: { isDefault: true }, take: 1 } },
    }),
  ]);
  if (cart.lines.length === 0) redirect("/cart");

  const addr = customer?.addresses[0] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink md:text-3xl">Checkout</h1>
      {intent && <section aria-label="Pembelian langsung" data-testid="direct-checkout-summary">
        <p>Hanya pilihan ini yang dibeli. Keranjang Anda tetap tersimpan.</p>
        {cart.lines.map(line => <p key={line.variantId}>{line.product.name} — {line.variantLabel} × {line.quantity}</p>)}
      </section>}
      <CheckoutClient
        key={intent || "cart"}
        intentId={intent}
        requestId={randomUUID()}
        subtotal={cart.subtotal}
        expectedLines={cart.lines.map(({ variantId, quantity, unitPrice }) => ({ variantId, quantity, unitPrice }))}
        banks={banks}
        address={addr ? {
          recipientName: addr.recipientName,
          phone: addr.phone,
          line: addr.line,
          city: addr.city,
          province: addr.province,
          postalCode: addr.postalCode,
          provinceCode: addr.provinceCode, cityCode: addr.cityCode, districtCode: addr.districtCode, villageCode: addr.villageCode,
          district: addr.district, village: addr.village, regionSource: addr.regionSource, regionUpdatedAt: addr.regionUpdatedAt,
        } : null}
      />
    </div>
  );
}
