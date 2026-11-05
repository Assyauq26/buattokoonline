import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast" && (ip.kind() === "ipv4" || ip.match(ipaddr.IPv6.parse("2000::"), 3));
  } catch { return false; }
}

export async function postPinnedJnt(url: string, body: string, headers: Record<string, string>, method: "POST" | "HEAD" = "POST") {
  const target = new URL(url);
  const signal = AbortSignal.timeout(6000);
  if (target.protocol !== "https:" || target.username || target.password || target.port) throw new Error("Invalid carrier URL");
  const addresses = await new Promise<Awaited<ReturnType<typeof lookupAll>>>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    lookupAll(target.hostname).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error("Invalid carrier DNS");
  const pinned = addresses.find(entry => entry.family === 4) ?? addresses[0];
  return new Promise<Response>((resolve, reject) => {
    const req = request(target, {
      method, headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)), "Accept-Encoding": "identity" },
      signal, agent: false, family: pinned.family,
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, res => {
      const status = res.statusCode ?? 502;
      if (method === "HEAD" || status === 204 || status === 304) {
        res.resume();
        resolve(new Response(null, { status }));
        return;
      }
      if (status < 200) {
        res.destroy();
        reject(new Error("Invalid carrier response"));
        return;
      }
      resolve(new Response(Readable.toWeb(res) as ReadableStream, {
        status, headers: { "content-length": res.headers["content-length"] || "0" },
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function lookupAll(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true });
}
