import { validateJntLocation } from "@/infrastructure/shipping/jnt/mapping-regions";
import { lockCampaignPricing } from "@/modules/promotions/campaign-pricing";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/response";
import { getCartView } from "@/modules/cart/cart.service";
import { reserveStock } from "@/modules/inventory/inventory.service";
import { computeDiscount } from "@/modules/promotions/coupon.service";
import { getPaymentProvider } from "@/infrastructure/payments";
import { approvedRevision, readShippingSettings } from "@/modules/shipping/shipping-settings.service";
import { flatShippingRate } from "@/modules/shipping/shipping-settings-input";
import { availableJntRates } from "@/infrastructure/shipping/jnt/official-transport";
import { requireEz } from "@/infrastructure/shipping/jnt/official-config";
import { mappedDestination } from "@/infrastructure/shipping/jnt/verified-mapping";
import { checkoutLinesSchema, checkoutQuoteSchema, checkoutSignature, type CheckoutLines, type CheckoutQuoteConfirmation } from "./checkout.validation";
import { getIntentCheckoutView, readCheckoutIntent } from "./checkout-intent";
import { writeAudit } from "@/modules/audit/audit.service";
import { addressSchema, type SelectedLocation } from "@/modules/regions/region.validation";
import { validateLocation } from "@/modules/regions/region.service";
import type { ShippingInquiry, ShippingRate } from "@/infrastructure/shipping/contracts/shipping-provider";
import { issueShippingQuote, shippingFingerprint, verifyShippingQuote } from "./shipping-quote";

export interface AddressInput {
  recipientName: string;
  phone: string;
  line: string;
  city: string;
  province: string;
  postalCode: string;
  provinceCode?: string; cityCode?: string; districtCode?: string; villageCode?: string;
  district?: string; village?: string; regionSource?: string; regionUpdatedAt?: string;
}

export interface ShippingChoice {
  courier: string;
  service: string;
  cost: number;
  quoteToken?: string;
}

function genOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${t}-${r}`;
}

/**
 * Resolve a trusted shipping cost from the server-side rate table.
 * The client-submitted cost is never trusted; only courier/service are used to look it up.
 */
async function shippingInquiry(cart: { lines: Array<{ product: { id: string }; quantity: number }> }, destination: SelectedLocation, tx: Prisma.TransactionClient = prisma): Promise<ShippingInquiry> {
  const ids = [...new Set(cart.lines.map(l => l.product.id))].sort();
  const products = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, weightGrams: true, packageLengthMm: true, packageWidthMm: true, packageHeightMm: true } });
  let weightGram = 0;
  const quantities = new Map<string, number>();
  for (const line of cart.lines) quantities.set(line.product.id, (quantities.get(line.product.id) || 0) + line.quantity);
  const packages = ids.map(id => {
    const p = products.find(p => p.id === id);
    if (!p || !Number.isSafeInteger(p.weightGrams) || !p.weightGrams || p.weightGrams <= 0) throw new HttpError("Berat produk belum valid. Hubungi toko sebelum checkout.", 422);
    const quantity = quantities.get(id)!;
    weightGram += p.weightGrams * quantity;
    return { productId: id, quantity, weightGram: p.weightGrams, lengthMm: p.packageLengthMm, widthMm: p.packageWidthMm, heightMm: p.packageHeightMm };
  });
  if (!Number.isSafeInteger(weightGram) || weightGram <= 0 || weightGram > 2_147_483_647) throw new HttpError("Berat pesanan tidak valid", 422);
  return { destination, weightGram, packages };
}
async function checkoutShipping(userId: string, cart: { lines: Array<CheckoutLines[number] & { product: { id: string } }> }, location: SelectedLocation, settings: Awaited<ReturnType<typeof readShippingSettings>>) {
  const inquiry = settings.activeJnt ? await shippingInquiry(cart, location) : { destination: location, weightGram: 0, packages: [] };
  let rates: ShippingRate[];
  if (settings.activeJnt) {
    const { config, mappingVersion } = approvedRevision(settings.activeJnt);
    requireEz(config);
    const mapping = await mappedDestination(location.districtCode, mappingVersion);
    rates = (await availableJntRates({ originSite: config.seller!.warehouse.originSite, destinationArea: mapping.destAreaCode,
      weightGram: inquiry.weightGram }, config))
      .map(rate => ({ ...rate, reference: mappingVersion }));
    if (!rates.length) throw new HttpError("J&T belum mengembalikan layanan yang dipilih untuk alamat ini. Coba kembali atau hubungi toko.", 502);
  } else {
    if (settings.manualFlat === null) throw new HttpError("Toko belum menetapkan ongkir Manual. Hubungi toko.", 503);
    rates = [flatShippingRate(settings.manualFlat)];
  }
  const fingerprint = shippingFingerprint(userId, inquiry, checkoutSignature(cart.lines), settings.revision);
  return { fingerprint, rates, options: rates.map(r => issueShippingQuote(fingerprint, r)), revisionId: settings.activeJntId };
}

/** Server-side recalculation only. Client-submitted totals are ignored. */
export async function previewCheckout(
  userId: string,
  input: { couponCode?: string; shipping?: ShippingChoice; intentId?: string; address?: unknown },
) {
  const cart = input.intentId ? await getIntentCheckoutView(input.intentId, userId) : await getCartView(userId);
  if (cart.lines.length === 0) throw new HttpError("Keranjang kosong", 400);

  const settings = input.address ? await readShippingSettings() : null;
  const location = !input.address ? null : settings?.activeJnt
    ? await validateJntLocation(input.address, settings.activeJnt.mappingVersion)
    : await validateLocation(input.address);
  if (input.shipping && !location) throw new HttpError("Silakan pilih lokasi pengiriman.", 422);
  const shipping = location && settings ? await checkoutShipping(userId, cart, location, settings) : null;
  const selected = input.shipping ? shipping?.rates.find(r => r.courier === input.shipping!.courier && r.service === input.shipping!.service) : null;
  if (input.shipping && !selected) throw new HttpError("Layanan pengiriman belum tersedia untuk alamat ini.", 422);
  const accepted = selected ? verifyShippingQuote(input.shipping?.quoteToken, shipping!.fingerprint, selected) : null;
  const shippingCost = selected?.cost ?? 0;
  const { discount, code, reason } = await computeDiscount(input.couponCode, cart.subtotal, prisma, userId);
  const total = cart.subtotal + shippingCost - discount;
  return {
    lines: cart.lines,
    subtotal: cart.subtotal,
    shippingCost,
    discount,
    couponCode: code,
    couponReason: reason ?? null,
    total,
    shippingRates: shipping?.options ?? [],
    shippingValid: !!selected,
    quoteExpiresAt: accepted?.expiresAt ?? null,
  };
}

export async function createOrder(
  userId: string,
  input: {
    address: AddressInput;
    shipping: ShippingChoice;
    couponCode?: string;
    bankAccountId: string;
    note?: string;
    expectedLines?: CheckoutLines;
    expectedQuote?: CheckoutQuoteConfirmation;
    requestId?: string;
    intentId?: string;
  },
) {
  const confirmation = checkoutLinesSchema.safeParse(input.expectedLines);
  if (!confirmation.success) throw new HttpError("Muat ulang checkout dan konfirmasi harga sebelum membuat pesanan.", 409);
  const acceptedQuote = input.expectedQuote ? checkoutQuoteSchema.safeParse(input.expectedQuote) : null;
  if (acceptedQuote && !acceptedQuote.success) throw new HttpError("Ringkasan harga tidak valid. Muat ulang checkout.", 409);
  // Existing non-coupon API orders can still use the historical lines confirmation,
  // but a coupon order MUST include the confirmed discount and final total.
  if (input.couponCode?.trim() && !acceptedQuote?.success) {
    throw new HttpError("Konfirmasi diskon dan total diperlukan. Muat ulang checkout.", 409);
  }
  if (input.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw new HttpError("Request checkout tidak valid", 422);
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  // Persist idempotency through the existing Order PK and transactional audit metadata.
  if (input.intentId) await readCheckoutIntent(input.intentId, userId, prisma, true);
  const orderId = input.intentId ? `buy_${hash(`${userId}:${input.intentId}`).slice(0, 40)}` : input.requestId ? `chk_${hash(`${userId}:${input.requestId}`).slice(0, 40)}` : undefined;
  const requestDigest = hash(JSON.stringify({ ...(input.intentId ? { intentId: input.intentId } : {}), address: Object.entries(input.address).sort(([a], [b]) => a.localeCompare(b)), shipping: { courier: input.shipping.courier, service: input.shipping.service }, bankAccountId: input.bankAccountId, couponCode: input.couponCode?.toUpperCase() || null, note: input.note || null, lines: checkoutSignature(confirmation.data), expectedQuote: acceptedQuote?.success ? acceptedQuote.data : null }));
  const replay = async (tx: Prisma.TransactionClient) => {
    if (!orderId) return null;
    const existing = await tx.order.findUnique({ where: { id: orderId, userId } });
    if (!existing) return null;
    const audit = await tx.auditLog.findFirst({ where: { entity: "Order", entityId: orderId, action: "order.create" } });
    const meta = audit?.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta) || meta.requestDigest !== requestDigest) throw new HttpError("Request ID sudah digunakan untuk checkout yang berbeda", 409);
    return existing;
  };
  const previous = await replay(prisma);
  if (previous) return previous;
  const cartView = await (async () => {
    try { return input.intentId ? await getIntentCheckoutView(input.intentId, userId) : await getCartView(userId); }
    catch (error) {
      const completed = await replay(prisma);
      if (completed) return null;
      throw error;
    }
  })();
  if (!cartView) return (await replay(prisma))!;
  if (cartView.lines.length === 0) {
    const completed = await replay(prisma);
    if (completed) return completed;
    throw new HttpError("Keranjang kosong atau sudah diproses", 409);
  }
  if (cartView.lines.some(line => !line.inStock)) {
    // A parallel identical request may have reserved this last item after the
    // initial replay probe but before this availability read completed.
    const completed = await replay(prisma);
    if (completed) return completed;
    throw new HttpError("Produk tidak tersedia atau stok tidak mencukupi", 409);
  }
  if (checkoutSignature(confirmation.data) !== checkoutSignature(cartView.lines)) throw new HttpError("Harga atau isi keranjang berubah. Muat ulang checkout dan konfirmasi ulang sebelum membuat pesanan.", 409);

  const bank = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, isActive: true, deletedAt: null },
  });
  if (!bank) throw new HttpError("Rekening bank tidak valid", 400);


  const parsedAddress = addressSchema.parse(input.address);
  const settings = await readShippingSettings();
  const location = settings.activeJnt
    ? await validateJntLocation(parsedAddress, settings.activeJnt.mappingVersion)
    : await validateLocation(parsedAddress);
  const canonicalAddress = { recipientName: parsedAddress.recipientName, phone: parsedAddress.phone, line: parsedAddress.line, ...location };
  const quotedShipping = await checkoutShipping(userId, cartView, location, settings);
  if (quotedShipping.revisionId) {
    const address = [canonicalAddress.line, location.village, location.district, location.city, location.province].filter(Boolean).join(", ");
    if (canonicalAddress.recipientName.length > 30 || address.length > 200) {
      throw new HttpError("Untuk J&T, gunakan nama penerima maksimal 30 karakter dan alamat lengkap maksimal 200 karakter", 422);
    }
  }
  const selectedRate = quotedShipping.rates.find(r => r.courier === input.shipping.courier && r.service === input.shipping.service);
  if (!selectedRate) throw new HttpError("Layanan pengiriman belum tersedia untuk alamat ini.", 422);
  verifyShippingQuote(input.shipping.quoteToken, quotedShipping.fingerprint, selectedRate);
  if (!acceptedQuote?.success) throw new HttpError("Konfirmasi total dan ongkir diperlukan.", 409);
  const shippingCost = selectedRate.cost;

  const orderNumber = genOrderNumber();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`);
    if (!await tx.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, select: { id: true } })) throw new HttpError("Akun tidak aktif. Silakan login kembali.", 401);
    await lockCampaignPricing(tx);
    // Serialize consumption of this cart; lock items too against concurrent edits/removal.
    if (input.intentId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CheckoutIntent" WHERE "id" = ${input.intentId} AND "userId" = ${userId} FOR UPDATE`);
      await readCheckoutIntent(input.intentId, userId, tx, true);
    } else {
      const carts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE`);
      if (!carts.length) throw new HttpError("Keranjang kosong atau sudah diproses", 409);
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CartItem" WHERE "cartId" = ${carts[0].id} ORDER BY "id" FOR UPDATE`);
    }
    const processed = await replay(tx);
    if (processed) return { order: processed, created: false };
    // Catalog locks match product management's Product -> Variant -> Inventory order.
    const productIds = [...new Set(cartView.lines.map(line => line.product.id))].sort();
    const published = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Product"
      WHERE "id" IN (${Prisma.join(productIds)}) AND "status" = 'PUBLISHED'
      ORDER BY "id" FOR SHARE
    `);
    if (published.length !== productIds.length) throw new HttpError("Produk tidak lagi tersedia. Periksa keranjang Anda.", 409);
    const variantIds = cartView.lines.map(l => l.variantId).sort();
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(variantIds)}) ORDER BY "id" FOR SHARE`);
    const current = input.intentId ? await getIntentCheckoutView(input.intentId, userId, tx) : await getCartView(userId, tx);
    if (!current.lines.length) throw new HttpError("Keranjang sudah diproses. Periksa pesanan Anda.", 409);
    if (checkoutSignature(current.lines) !== checkoutSignature(confirmation.data)) throw new HttpError("Harga atau isi keranjang berubah. Muat ulang checkout dan konfirmasi ulang sebelum membuat pesanan.", 409);
    if (current.lines.some(l => !l.inStock || !Number.isSafeInteger(l.quantity) || l.quantity <= 0)) throw new HttpError("Produk tidak tersedia atau stok tidak mencukupi", 409);
    // Product locks also protect shipping metadata. Reject address/cart/weight/config changes
    // and expired quotes before any order, stock, payment, or cart mutation.
    await tx.$queryRaw`SELECT id FROM "ShippingSettings" WHERE id = 1 FOR SHARE`;
    const shippingSettings = await readShippingSettings(tx);
    if (shippingSettings.activeJnt) requireEz(approvedRevision(shippingSettings.activeJnt).config);
    const lockedInquiry = shippingSettings.activeJnt ? await shippingInquiry(current, location, tx) : { destination: location, weightGram: 0, packages: [] };
    verifyShippingQuote(input.shipping.quoteToken, shippingFingerprint(userId, lockedInquiry, checkoutSignature(current.lines), shippingSettings.revision), selectedRate);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "BankAccount" WHERE "id" = ${bank.id} FOR SHARE`);
    const lockedBank = await tx.bankAccount.findFirst({ where: { id: bank.id, isActive: true, deletedAt: null } });
    if (!lockedBank) throw new HttpError("Rekening bank tidak valid", 409);
    // Serializes redemptions for capped coupons across concurrent checkout transactions.
    if (input.couponCode) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Coupon" WHERE "code" = ${input.couponCode.toUpperCase()} FOR UPDATE`);
    const { discount, code } = await computeDiscount(input.couponCode, current.subtotal, tx, userId);
    const total = current.subtotal + shippingCost - discount;
    // Compare against the buyer-visible preview while holding the coupon lock
    // inside the same transaction that creates the order and reserves inventory.
    if (acceptedQuote?.success && (
      acceptedQuote.data.subtotal !== current.subtotal ||
      acceptedQuote.data.shippingCost !== shippingCost ||
      acceptedQuote.data.discount !== discount ||
      acceptedQuote.data.total !== total
    )) throw new HttpError("Harga, ongkir, atau kupon berubah. Muat ulang checkout dan konfirmasi ulang total pesanan.", 409);
    if (![current.subtotal, shippingCost, discount, total].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647)) throw new HttpError("Total pesanan tidak valid", 422);
    const created = await tx.order.create({
      data: {
        ...(orderId ? { id: orderId } : {}),
        orderNumber,
        userId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING_PAYMENT",
        subtotal: current.subtotal,
        shippingCost,
        discount,
        total,
        couponCode: code,
        note: input.note,
        expiresAt,
        items: {
          create: current.lines.map((l) => ({
            variantId: l.variantId,
            productName: l.product.name,
            variantLabel: l.variantLabel,
            imageUrl: l.product.image,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
        address: { create: canonicalAddress },
        shippingCourier: selectedRate.courier,
        shippingService: selectedRate.service,
        shippingMode: selectedRate.mode || "official",
        jntCheckoutRevisionId: quotedShipping.revisionId,
        shippingWeightGram: quotedShipping.revisionId ? lockedInquiry.weightGram : null,
        shippingQuoteReference: selectedRate.reference,
        history: {
          create: { toStatus: "PENDING_PAYMENT", note: "Order dibuat", createdBy: userId },
        },
      },
    });

    for (const line of [...current.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      await reserveStock(tx, line.variantId, line.quantity, created.orderNumber);
    }

    // Save the confirmed structured address without rewriting any legacy address.
    // A dedicated address lock serializes cart/Buy Now without changing auth row locking.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-address:${userId}`}, 0))`);
    const customer = await tx.customer.upsert({ where: { userId }, create: { userId, fullName: (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } })).name }, update: {} });
    const savedAddress = await tx.customerAddress.findFirst({ where: { customerId: customer.id, ...canonicalAddress } });
    await tx.customerAddress.updateMany({ where: { customerId: customer.id, isDefault: true }, data: { isDefault: false } });
    if (savedAddress) await tx.customerAddress.update({ where: { id: savedAddress.id }, data: { isDefault: true } });
    else await tx.customerAddress.create({ data: { customerId: customer.id, ...canonicalAddress, isDefault: true } });

    await tx.payment.create({
      data: {
        orderId: created.id,
        provider: "manual",
        method: "bank_transfer",
        amount: total,
        status: "PENDING_PAYMENT",
        bankAccountId: bank.id,
      },
    });

    if (input.intentId) {
      await tx.checkoutIntent.update({ where: { id: input.intentId }, data: { consumedAt: new Date(), orderId: created.id } });
    } else {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    await writeAudit(
      { userId, action: "order.create", entity: "Order", entityId: created.id, meta: { orderNumber, total, requestDigest } },
      tx,
    );
    return { order: created, created: true };
  });
  const { order } = result;
  if (!result.created) return order;

  // Build payment instruction via provider abstraction (manual MVP).
  const provider = getPaymentProvider("manual");
  await provider.createPayment({
    orderNumber,
    amount: order.total,
    bankAccount: {
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      displayName: bank.displayName,
    },
    expiresAt,
  });

  return order;
}
