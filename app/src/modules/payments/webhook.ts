import { NextResponse } from "next/server";

/**
 * Shared webhook acknowledgement for future payment/shipping providers.
 * MVP: providers are disabled, so we verify-ready + idempotent-ready and acknowledge.
 * When a provider is enabled, verify signature here and dispatch to the adapter's handleWebhook.
 */
export async function acknowledgeWebhook(provider: string, req: Request) {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }
  const eventId =
    (payload as any)?.event_id ?? (payload as any)?.id ?? req.headers.get("x-event-id") ?? null;

  // Signature verification placeholder (provider-specific header) — enabled with credentials.
  // Idempotency: a real implementation records eventId in payment_events with a unique constraint.
  console.log(`[webhook:${provider}] received event ${eventId ?? "(none)"}`);

  return NextResponse.json({ success: true, data: { received: true, provider, eventId } });
}
