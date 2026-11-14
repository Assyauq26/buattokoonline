import { expect, it } from "vitest";
import {
  paymentWindow,
  matchAmountWindow,
  type PaymentWindowMinutes,
} from "@/modules/payments/evidence/amount-window";
import { allocateAmount } from "@/modules/payments/evidence/policy";
import { parseBluEmail } from "@/modules/payments/evidence/blu-email";
import { vi } from "vitest";
import { BLU_HTML, syntheticBluEml } from "../fixtures/blu-email";
vi.mock("server-only", () => ({}));

const start = new Date("2026-11-14T03:20:00Z");
it.each([5, 10] as const)(
  "uses an inclusive start and exclusive %s-minute expiry",
  (minutes) => {
    const w = paymentWindow(start, minutes),
      candidate = {
        id: "order-A",
        payable: 45341,
        createdAt: w.startsAt,
        expiresAt: w.expiresAt,
      };
    expect(+w.expiresAt - +w.startsAt).toBe(minutes * 60000);
    for (const date of [start, new Date(+w.expiresAt - 1)])
      expect(
        matchAmountWindow({ amount: 45341, occurredAt: date }, [candidate]),
      ).toEqual({ status: "MATCHED", candidateIds: ["order-A"] });
    for (const date of [
      new Date(+start - 1),
      w.expiresAt,
      new Date(+w.expiresAt + 1),
    ])
      expect(
        matchAmountWindow({ amount: 45341, occurredAt: date }, [candidate])
          .status,
      ).toBe("NO_MATCH");
  },
);
it.each([0, 1, 15, 24 * 60, NaN, "5"])(
  "rejects unsupported windows %s",
  (minutes) =>
    expect(() =>
      paymentWindow(start, minutes as PaymentWindowMinutes),
    ).toThrow(),
);
it("defaults to ten minutes, rejects invalid/overflow dates and does not mutate the issue date", () => {
  const snapshot = +start;
  expect(+paymentWindow(start).expiresAt - +start).toBe(600000);
  expect(+start).toBe(snapshot);
  expect(() => paymentWindow(new Date(NaN))).toThrow();
  expect(() => paymentWindow(new Date(8.64e15))).toThrow();
});
it("matches Rp45.341 without payer name or bank reference and keeps colliding totals unavailable", async () => {
  const occupied = new Set(
    Array.from({ length: 340 }, (_, index) => 45001 + index),
  );
  const issued = allocateAmount(45000, occupied);
  expect(issued).toEqual({
    baseAmount: 45000,
    uniqueCode: 341,
    payable: 45341,
  });
  const decoded = await parseBluEmail(
    syntheticBluEml({ html: BLU_HTML.replace("125.001", "45.341") }),
  );
  expect(decoded.observation.amount).toBe(45341);
  expect(decoded.observation.bankTxId).toBeUndefined();
  const interval = paymentWindow(start, 5);
  const result = matchAmountWindow(decoded.observation, [
    {
      id: "matched-order",
      payable: issued.payable,
      createdAt: interval.startsAt,
      expiresAt: interval.expiresAt,
    },
  ]);
  expect(result).toEqual({
    status: "MATCHED",
    candidateIds: ["matched-order"],
  });
  expect(allocateAmount(45340, new Set([45341])).payable).toBe(45342);
  expect(decoded.observation.trusted).toBe(false);
  expect(decoded.observation.status).toBe("UNKNOWN");
});
it("does not select the first of multiple candidates, and rejects under/over/invalid money", () => {
  const interval = paymentWindow(start),
    a = {
      id: "A",
      payable: 45341,
      createdAt: interval.startsAt,
      expiresAt: interval.expiresAt,
    },
    b = { ...a, id: "B" };
  expect(
    matchAmountWindow({ amount: 45341, occurredAt: start }, [a, b]),
  ).toEqual({ status: "AMBIGUOUS", candidateIds: ["A", "B"] });
  expect(
    matchAmountWindow({ amount: 45341, occurredAt: start }, [a, a]),
  ).toHaveProperty("status", "MATCHED");
  for (const amount of [45340, 45342])
    expect(matchAmountWindow({ amount, occurredAt: start }, [a]).status).toBe(
      "NO_MATCH",
    );
  for (const amount of [null, 0, -1, 1.2, NaN, Infinity, 2147483648])
    expect(matchAmountWindow({ amount, occurredAt: start }, [a]).status).toBe(
      "INVALID_INPUT",
    );
  expect(
    matchAmountWindow({ amount: 45341, occurredAt: new Date(NaN) }, [a]).status,
  ).toBe("INVALID_INPUT");
});
