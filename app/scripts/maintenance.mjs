// Invoked inside the app container by a local systemd timer. No external service.
if (!process.env.CRON_SECRET) throw new Error('Maintenance is not configured');
for (const name of ['expire-orders', 'product-media-cleanup']) {
  const response = await fetch(`http://127.0.0.1:3000/api/internal/cron/${name}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Local maintenance ${name} failed (${response.status})`);
  console.log(`${name}: completed`);
}
