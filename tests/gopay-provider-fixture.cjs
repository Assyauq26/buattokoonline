// Test-only preload. Never packaged (tests/ is outside app/ and Docker context).
// No real provider request or credential is available to this isolated browser lab.
const fs = require('node:fs');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.STORE_ISOLATED_TESTS !== '1' || url.hostname !== '127.0.0.1' || url.port !== '5568' || url.pathname !== '/hubify_payment_evidence_test' || process.env.APP_ORIGIN !== 'http://127.0.0.1:3018') throw Error('Exact isolated payment browser environment required');
const original = globalThis.fetch;
globalThis.fetch = async function(input, init) {
  const u = new URL(typeof input === 'string' ? input : input.url || input.toString());
  if (!['api.gobiz.co.id', 'api.gojekapi.com'].includes(u.hostname)) return original(input, init);
  const fixture = JSON.parse(fs.readFileSync(process.env.GOPAY_FIXTURE_FILE, 'utf8'));
  const response = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
  if (u.pathname === '/goid/login/request') return response({data:{otp_token:'synthetic-challenge'}});
  if (u.pathname === '/goid/token') return response({data:{access_token:'synthetic-access', refresh_token:'synthetic-refresh',expires_in:3600}});
  if (u.pathname === '/goresto/v5/public/users/config') return response({merchant:{id:fixture.merchantId,outlet_name:fixture.merchantName}});
  if (u.pathname === '/merchant-analytics/v2/merchants/transactions') {
    if (u.searchParams.get('merchant_ids') !== fixture.merchantId) throw Error('Fixture merchant isolation');
    const from=Number(u.searchParams.get('from')),size=Number(u.searchParams.get('size'));
    const rows=fixture.transactions.filter(t=>+new Date(t.transaction_time)>=+new Date(u.searchParams.get('start_time')) && +new Date(t.transaction_time)<=+new Date(u.searchParams.get('end_time')));
    return response({transactions:rows.slice(from,from+size)});
  }
  throw Error('Unexpected provider path in isolated fixture');
};
