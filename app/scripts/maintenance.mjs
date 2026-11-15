// Invoked inside the app container by a local systemd timer. No external service.
if (!process.env.CRON_SECRET) throw new Error('Maintenance is not configured');
const maintenanceStarted = Date.now();
for (const name of ['expire-orders', 'product-media-cleanup', 'jnt-tracking']) {
  const response = await fetch(`http://127.0.0.1:3000/api/internal/cron/${name}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Local maintenance ${name} failed (${response.status})`);
  console.log(`${name}: completed`);
}
const mailSync = await fetch('http://127.0.0.1:3000/api/internal/cron/mail-brand', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(8000),
});
if (!mailSync.ok) throw new Error(`Local maintenance mail-brand failed (${mailSync.status})`);
// Keep the existing 120-second systemd budget and carrier/expiry work. An
// overdue read retries from its durable cursor next tick; buyer tabs never poll Gmail.
if ((process.env.PAYMENT_BLU_CHECKOUT_ENABLED === 'true' || process.env.PAYMENT_GOPAY_CHECKOUT_ENABLED === 'true') && Date.now() - maintenanceStarted < 45000) {
  const evidence = await fetch('http://127.0.0.1:3000/api/internal/cron/payment-evidence', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(60000),
  });
  if (!evidence.ok) throw new Error(`Local maintenance payment-evidence failed (${evidence.status})`);
  console.log('payment-evidence: completed');
}
