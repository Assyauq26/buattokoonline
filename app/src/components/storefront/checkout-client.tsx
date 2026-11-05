"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Truck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RegionSelectorDialog } from "./region-selector-dialog";
import { addressSchema, locationSchema, type SelectedLocation } from "@/modules/regions/region.validation";
import { formatIDR } from "@/lib/money";
import { createOrderAction } from "@/modules/checkout/checkout.actions";
import type { CheckoutLines } from "@/modules/checkout/checkout.validation";
import { cn } from "@/lib/utils";

interface Rate {
  courier: string;
  service: string;
  cost: number;
  etd?: string;
  quoteToken: string;
  expiresAt: number;
  mode: "manual" | "official";
}
interface Bank {
  id: string;
  displayName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}
interface Addr {
  recipientName: string;
  phone: string;
  line: string;
  city: string;
  province: string;
  postalCode: string;
  provinceCode?: string | null; cityCode?: string | null; districtCode?: string | null; villageCode?: string | null;
  district?: string | null; village?: string | null; regionSource?: string | null; regionUpdatedAt?: string | null;
}
interface CheckoutQuote {
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  couponCode: string | null;
  couponReason: string | null;
  shippingRates: Rate[];
  shippingValid: boolean;
  quoteExpiresAt: number | null;
}
type QuoteState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string }
  | { key: string; status: "ready"; data: CheckoutQuote };

function PlaceOrderBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="checkout-submit w-full"
      size="lg"
      disabled={pending || disabled}
      data-testid="place-order-btn"
    >
      {pending ? "Memproses..." : "Buat Pesanan"}
    </Button>
  );
}

export function CheckoutClient({
  subtotal,
  expectedLines,
  requestId,
  intentId,
  banks,
  address,
}: {
  subtotal: number;
  expectedLines: CheckoutLines;
  requestId: string;
  intentId?: string;
  banks: Bank[];
  address: Addr | null;
}) {
  const [state, action] = useFormState(createOrderAction, { ok: false } as any);
  const submitting = useRef(false);
  useEffect(() => {
    submitting.current = false;
  }, [state]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [rateIdx, setRateIdx] = useState(-1);
  const [location, setLocation] = useState<SelectedLocation | null>(() =>
    address && locationSchema.safeParse(address).success && address.district && address.village
      ? { ...address, ...locationSchema.parse(address), district: address.district, village: address.village, regionSource: address.regionSource || "emsifa-v2", regionUpdatedAt: address.regionUpdatedAt || "" } : null);
  const [recipient, setRecipient] = useState(address?.recipientName || "");
  const [phone, setPhone] = useState(address?.phone || "");
  const [street, setStreet] = useState(address?.line || "");
  const [now, setNow] = useState(0);
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [couponCode, setCouponCode] = useState("");
  const [retry, setRetry] = useState(0);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const rate = rates[rateIdx];
  const quoteKey = JSON.stringify([
    intentId,
    couponCode,
    rate?.courier,
    rate?.service,
    rate?.cost,
    rate?.quoteToken,
    location,
    retry,
  ]);

  useEffect(() => {
    if (!location) {
      setQuote({
        key: quoteKey,
        status: "error",
        message: "Silakan pilih lokasi pengiriman.",
      });
      return;
    }
    let active = true;
    const controller = new AbortController();
    setQuote({ key: quoteKey, status: "loading" });
    // Debounce typing; clearing a coupon / changing a rate can refresh immediately.
    const timeout = setTimeout(
      async () => {
        try {
          const response = await fetch("/api/v1/checkout/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({
              intentId,
              couponCode: couponCode || undefined,
              address: location,
              shipping: rate ? {
                courier: rate.courier,
                service: rate.service,
                cost: rate.cost,
                quoteToken: rate.quoteToken,
              } : undefined,
            }),
          });
          const result = await response.json();
          if (!response.ok || result.success !== true) {
            throw new Error(
              result.error?.message || "Perhitungan checkout gagal.",
            );
          }
          const data = result.data as CheckoutQuote;
          if (
            ![
              data.subtotal,
              data.shippingCost,
              data.discount,
              data.total,
            ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
            data.total !== data.subtotal + data.shippingCost - data.discount
          ) {
            throw new Error("Ringkasan dari server tidak valid.");
          }
          if (active) {
            if (!rate) setRates(data.shippingRates);
            setNow(Date.now());
            setQuote({ key: quoteKey, status: "ready", data });
          }
        } catch (error) {
          if (active && !controller.signal.aborted) {
            setQuote({
              key: quoteKey,
              status: "error",
              message:
                error instanceof Error ? error.message : "Koneksi terputus.",
            });
          }
        }
      },
      couponCode ? 350 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [quoteKey, couponCode, rate, intentId, location]);

  // Never render stale coupon/rate results, even before a previous request's effect cleanup runs.
  const currentQuote =
    quote?.key === quoteKey && quote.status === "ready" ? quote.data : null;
  useEffect(() => {
    if (!currentQuote?.quoteExpiresAt) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, currentQuote.quoteExpiresAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [currentQuote?.quoteExpiresAt]);
  const changedQuote =
    !!currentQuote &&
    !!rate && (currentQuote.subtotal !== subtotal ||
      currentQuote.shippingCost !== rate?.cost);
  const expired = !!currentQuote?.quoteExpiresAt && now >= currentQuote.quoteExpiresAt;
  const addressValid = addressSchema.safeParse({ ...location, recipientName: recipient, phone, line: street }).success;
  const canSubmit = !!currentQuote?.shippingValid && !changedQuote && !expired && addressValid && !!bankId;
  function refreshShipping() { setRateIdx(-1); setRates([]); setRetry(n => n + 1); }

  return (
    <form
      action={action}
      className="checkout-form grid gap-8 lg:grid-cols-[1fr_360px]"
      data-testid="checkout-form"
      onSubmit={(event) => {
        if (submitting.current || !canSubmit) {
          event.preventDefault();
          return;
        }
        submitting.current = true;
      }}
    >
      <input type="hidden" name="intentId" value={intentId || ""} />
      <input type="hidden" name="requestId" value={requestId} />
      <input
        type="hidden"
        name="expectedLines"
        value={JSON.stringify(expectedLines)}
      />
      <input
        type="hidden"
        name="expectedQuote"
        value={
          currentQuote
            ? JSON.stringify({
                subtotal: currentQuote.subtotal,
                shippingCost: currentQuote.shippingCost,
                discount: currentQuote.discount,
                total: currentQuote.total,
              })
            : ""
        }
      />
      <div className="space-y-8">
        {/* Recipient and structured address; legacy text stays intact until confirmed. */}
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">
            Data Penerima
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="checkout-recipient">Nama Penerima</Label>
              <Input
                name="recipientName"
                id="checkout-recipient" value={recipient} onChange={e => setRecipient(e.target.value)} minLength={2} maxLength={100} autoComplete="shipping name" placeholder="Nama lengkap penerima"
                required
                data-testid="input-recipient"
              />
            </div>
            <div>
              <Label htmlFor="checkout-phone">Nomor WhatsApp/HP</Label>
              <Input
                name="phone"
                id="checkout-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="shipping tel" placeholder="Contoh: 081234567890"
                required
                data-testid="input-phone"
              />
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Alamat Pengiriman</h2>
          <RegionSelectorDialog value={location} onChange={value => { setLocation(value); setRateIdx(-1); setRates([]); }} />
          {!location && address && <p className="text-sm text-ink-soft">Alamat tersimpan: {address.city}, {address.province}. Lengkapi wilayah melalui Pilih Lokasi; detail jalan Anda tetap tersimpan.</p>}
          {["provinceCode", "cityCode", "districtCode", "villageCode", "province", "city", "postalCode"].map(name => <input key={name} type="hidden" name={name} value={location?.[name as keyof SelectedLocation] || ""} />)}
          <div>
            <Label htmlFor="checkout-street">Detail alamat lengkap</Label>
            <Textarea
              name="line"
              id="checkout-street" value={street} onChange={e => setStreet(e.target.value)} minLength={4} maxLength={1000} autoComplete="shipping street-address" placeholder="Nama jalan, nomor rumah, RT/RW, dan patokan lokasi"
              required
              data-testid="input-line"
            />
          </div>
        </section>

        {/* Shipping */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Truck size={18} /> Layanan Pengiriman J&T Express
          </h2>
          <div className="space-y-2">
            {rates.map((r, i) => (
              <label
                key={i}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-xl border p-3",
                  rateIdx === i ? "border-black bg-surface" : "border-line",
                )}
                data-testid={`ship-option-${i}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="_rate"
                    checked={rateIdx === i}
                    onChange={() => setRateIdx(i)}
                    className="accent-black"
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {r.courier} - {r.service}
                    </p>
                    <p className="text-xs text-ink-muted">{r.etd}</p>
                    {r.mode === "manual" && <p className="text-xs text-ink-soft">Tarif manual toko untuk rute dan berat ini</p>}
                  </div>
                </div>
                <span className="text-sm font-semibold">
                  {formatIDR(r.cost)}
                </span>
              </label>
            ))}
          </div>
          {location && currentQuote && rates.length === 0 && <p role="status" className="text-sm text-ink-soft">Layanan J&T belum tersedia untuk alamat ini. Hubungi toko untuk tarif yang valid.</p>}
          {rates.length > 0 && !rate && <p className="text-sm text-ink-soft">Pilih layanan untuk memeriksa ongkir dan total terbaru.</p>}
          <input type="hidden" name="courier" value={rate?.courier} />
          <input type="hidden" name="service" value={rate?.service} />
          <input type="hidden" name="shippingCost" value={rate?.cost ?? 0} />
          <input type="hidden" name="quoteToken" value={rate?.quoteToken || ""} />
        </section>

        {/* Payment */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <CreditCard size={18} /> Metode Pembayaran
          </h2>
          <p className="text-sm text-ink-soft">
            Transfer Bank Manual — konfirmasi bukti transfer setelah pesanan
            dibuat.
          </p>
          <div className="space-y-2">
            {banks.map((b) => (
              <label
                key={b.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3",
                  bankId === b.id ? "border-black bg-surface" : "border-line",
                )}
                data-testid={`bank-option-${b.id}`}
              >
                <input
                  type="radio"
                  name="bankAccountId"
                  value={b.id}
                  checked={bankId === b.id}
                  onChange={() => setBankId(b.id)}
                  className="accent-black"
                  required
                />
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {b.displayName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {b.accountNumber} · a.n {b.accountHolder}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <div>
          <Label htmlFor="checkout-coupon">Kode Kupon (opsional)</Label>
          <Input
            id="checkout-coupon"
            name="couponCode"
            value={couponCode}
            maxLength={64}
            autoComplete="off"
            placeholder="GHEVER10"
            data-testid="input-coupon"
            onChange={(event) =>
              setCouponCode(event.target.value.toUpperCase().replace(/\s/g, ""))
            }
          />
          {currentQuote && couponCode && (
            <p
              className={cn(
                "mt-2 text-sm",
                currentQuote.couponCode ? "text-ink" : "text-destructive",
              )}
              role="status"
              data-testid="coupon-feedback"
            >
              {currentQuote.couponCode
                ? `Kupon ${currentQuote.couponCode} berhasil diterapkan.`
                : currentQuote.couponReason || "Kupon tidak valid."}
            </p>
          )}
        </div>
      </div>

      <div
        className="h-fit space-y-4 rounded-2xl border border-line p-5 lg:sticky lg:top-24"
        data-testid="checkout-summary"
      >
        <h2 className="font-display text-lg font-bold text-ink">
          Ringkasan Pesanan
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-soft">Subtotal</span>
            <span className="font-semibold">
              {formatIDR(currentQuote?.subtotal ?? subtotal)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-soft">Ongkir ({rate?.courier})</span>
            <span className="font-semibold">
              {currentQuote?.shippingValid ? formatIDR(currentQuote.shippingCost) : "—"}
            </span>
          </div>
          {currentQuote && currentQuote.discount > 0 && (
            <div
              className="flex justify-between"
              data-testid="checkout-discount"
            >
              <span className="text-ink-soft">Diskon kupon</span>
              <span className="font-semibold">
                - {formatIDR(currentQuote.discount)}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <span className="font-semibold text-ink">Total</span>
          <span
            className="font-display text-xl font-black text-ink"
            data-testid="checkout-total"
          >
            {currentQuote?.shippingValid ? formatIDR(currentQuote.total) : "—"}
          </span>
        </div>
        {(!quote || quote.key !== quoteKey || quote.status === "loading") && (
          <p
            className="text-xs text-ink-soft"
            role="status"
            data-testid="checkout-quote-loading"
          >
            Memeriksa total terbaru…
          </p>
        )}
        {quote?.key === quoteKey && quote.status === "error" && (
          <div
            className="space-y-1 text-sm text-destructive"
            role="alert"
            data-testid="checkout-quote-error"
          >
            <p>{quote.message}</p>
            <button
              type="button"
              className="font-semibold text-primary hover:text-blue-700 focus-visible:text-blue-700 active:text-blue-800"
              onClick={refreshShipping}
            >
              Coba lagi
            </button>
          </div>
        )}
        {changedQuote && (
          <p
            className="text-sm text-destructive"
            role="alert"
            data-testid="checkout-price-changed"
          >
            Harga atau ongkir berubah.{" "}
            <a
              href="/checkout"
              className="font-semibold text-primary hover:text-blue-700 focus-visible:text-blue-700 active:text-blue-800"
            >
              Muat ulang checkout
            </a>{" "}
            untuk mengonfirmasi total terbaru.
          </p>
        )}
        {expired && <p role="alert" className="text-sm">Ongkir kedaluwarsa. <button type="button" className="underline" onClick={refreshShipping}>Periksa ongkir kembali</button></p>}
        {!addressValid && <p className="text-sm text-ink-soft" role="status">Lengkapi nama penerima, nomor HP yang valid, lokasi, dan alamat rumah atau jalan.</p>}
        {state?.ok === false && state?.error && (
          <p className="text-sm text-destructive" data-testid="checkout-error">
            {state.error}{" "}
            <a
              href="/checkout"
              className="font-semibold text-primary hover:text-blue-700 focus-visible:text-blue-700 active:text-blue-800"
            >
              Muat ulang checkout untuk konfirmasi ulang
            </a>
          </p>
        )}
        <div
          className="checkout-purchase-bar"
          role="group"
          aria-label="Konfirmasi pesanan"
          data-testid="checkout-purchase-bar"
        >
          <div
            className="checkout-sticky-total"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-xs">Total</span>
            <strong
              className="font-display"
              data-testid="checkout-sticky-total"
            >
              {currentQuote?.shippingValid ? formatIDR(currentQuote.total) : "—"}
            </strong>
          </div>
          <PlaceOrderBtn disabled={!canSubmit} />
        </div>
        <p className="text-center text-[11px] text-ink-muted">
          Ringkasan dihitung oleh server. Total akan diverifikasi ulang saat
          pesanan dibuat.
        </p>
      </div>
    </form>
  );
}
