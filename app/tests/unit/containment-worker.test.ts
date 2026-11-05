import { expect, it } from "vitest";

it("blocks the __proto__ assignment primitive inside the actual Vitest worker", () => {
  const input = JSON.parse('{"__proto__":{"storeProbe":true}}');
  let caught: unknown;
  try {
    Object.assign({}, input);
  } catch (err) {
    caught = err;
  }
  expect(caught).toHaveProperty("code", "ERR_PROTO_ACCESS");
});
