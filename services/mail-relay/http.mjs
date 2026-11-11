import { createServer } from "node:http";
import { relayMail, hashRelayValue } from "./relay.mjs";

export function createRelayServer({ registry, reserve, deliver, dispatch, ready = () => true, receipt }) {
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    let status = 404;
    try {
      if (req.method === 'GET' && req.url === '/health') status = 200;
      else if (req.method === 'GET' && req.url === '/ready') status = await ready() ? 200 : 503;
      else if (req.method === "POST" && ['/api/platform/store-mail', '/api/platform/store-mail/status'].includes(req.url)) {
        const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (!token) { res.writeHead(401, { 'Cache-Control': 'no-store' }).end(); return; }
        status = 400;
        if (req.headers["content-type"] === "application/json") {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 4096) {
              res.writeHead(413, { Connection: "close", "Cache-Control": "no-store" }).end();
              return;
            }
            chunks.push(chunk);
          }
          let payload;
          try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
          catch { /* Malformed JSON stays a 400. */ }
          if (payload) {
            const tokenHash = hashRelayValue(token);
            const stores = await registry(tokenHash);
            if (req.url.endsWith('/status')) {
              const tenant = stores.get(tokenHash);
              if (payload.action === 'sync-brand') {
                const result = !tenant ? { status: 401 } :
                  payload.origin !== tenant.origin || !tenant.brandSync || !registry.syncBrand ? { status: 409 } :
                  await registry.syncBrand(tokenHash, payload);
                res.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                return res.end(JSON.stringify(result.brand ? { brand: result.brand } : {}));
              }
              if (tenant?.brandSync && payload.origin === tenant.origin && payload.action === 'sender-status') {
                status = await ready() ? 200 : 503;
                res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                return res.end(JSON.stringify({ brand: tenant.brand }));
              }
              status = !tenant ? 401 : payload.origin !== tenant.origin || payload.brand !== tenant.brand ? 409 :
                await ready() ? 200 : 503;
              if (status === 200 && receipt) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ receipt: receipt(tenant) }));
                return;
              }
            } else status = await relayMail({ authorization: req.headers.authorization, payload }, { stores, reserve, deliver, dispatch });
          }
        }
      }
    } catch {
      status = 503;
    }
    if (status === 503) console.warn("store_mail_relay.unavailable");
    if (status === 429) console.warn("store_mail_relay.quota_exhausted");
    res.writeHead(status, { "Cache-Control": "no-store", ...([429, 503].includes(status) ? { 'Retry-After': '30' } : {}) }).end();
  });
}
