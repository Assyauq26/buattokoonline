import { createServer } from "node:http";
import { relayMail } from "./relay.mjs";

export function createRelayServer({ registry, reserve, deliver }) {
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    let status = 404;
    try {
      if (req.method === "POST" && req.url === "/api/platform/store-mail") {
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
          if (payload) status = await relayMail({ authorization: req.headers.authorization, payload }, {
            stores: registry(), reserve, deliver,
          });
        }
      }
    } catch {
      status = 503;
    }
    if (status === 503) console.warn("store_mail_relay.unavailable");
    res.writeHead(status, { "Cache-Control": "no-store" }).end();
  });
}
