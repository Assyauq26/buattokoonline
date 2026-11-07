import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createRelayServer } from "./http.mjs";
import { openQuota } from "./quota.mjs";
import { hashRelayValue, parseRegistry } from "./relay.mjs";

test("HTTP relay enforces recipient scope and SQLite quotas with a fake provider", async () => {
  const origin = "https://shop.example.test";
  const token = "a".repeat(64);
  const to = "seller@example.test";
  const stores = parseRegistry([{ origin, brand: "Gheverhan", tokenHash: hashRelayValue(token), sellerEmails: [to] }]);
  const quota = openQuota(":memory:");
  const messages = [];
  const server = createRelayServer({ registry: () => stores, reserve: quota.reserve, deliver: async mail => { messages.push(mail); } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = `http://127.0.0.1:${server.address().port}/api/platform/store-mail`;
    const submit = async (payload, authorization = `Bearer ${token}`) => (await fetch(address, {
      method: "POST", headers: { authorization, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })).status;
    const data = { purpose: "customer-test", brand: "Gheverhan", origin, to, value: "" };
    assert.equal(await submit(data, "Bearer invalid"), 401);
    assert.equal(await submit({ ...data, to: "other@example.test" }), 403);
    assert.equal(await submit({ ...data, value: "a".repeat(4096) }), 413);
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => submit(data)));
    assert.deepEqual(concurrent.sort(), [202, 202, 202, 429, 429]);
    assert.equal(messages.length, 3);
    assert.equal(messages[0].from, "Gheverhan <otp@buattokosendiri.web.id>");
    assert.equal(await submit({ ...data, purpose: "seller-reset", value: "012345" }), 202);
    assert.equal(messages[3].from, "Buattokosendiri <otp@buattokosendiri.web.id>");
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    quota.close();
  }
});
