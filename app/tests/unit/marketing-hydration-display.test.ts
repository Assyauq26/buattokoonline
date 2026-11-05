import { afterEach, describe, expect, it, vi } from "vitest";
import { formatWibDate, scheduledFlashStatusAt, voucherStatusAt } from "@/modules/promotions/marketing-display";

afterEach(() => vi.useRealTimers());

describe("Marketing dashboard SSR/hydration deterministic labels", () => {
  it("formats in WIB regardless of host timezone and UTC day boundaries", () => {
    expect(formatWibDate("2026-10-16T00:00:00.000Z")).toBe("16/10/2026 07:00 WIB");
    expect(formatWibDate("2026-10-16T17:00:00.000Z")).toBe("17/10/2026 00:00 WIB");
    expect(formatWibDate("not-a-date")).toBe("—");
  });

  it("keeps server and browser voucher status equal with a shared reference instant", () => {
    const now = Date.parse("2026-10-16T10:00:00.000Z");
    const v = { isActive: true, startsAt: "2026-10-16T10:00:01.000Z", expiresAt: "2026-10-16T10:00:02.000Z" };
    expect(voucherStatusAt(v, now)).toBe("Terjadwal");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T10:00:04.000Z"));
    // First hydration pass uses the server snapshot, not Date.now().
    expect(voucherStatusAt(v, now)).toBe("Terjadwal");
    expect(voucherStatusAt(v, Date.now())).toBe("Kedaluwarsa");
    expect(voucherStatusAt({ ...v, isActive: false }, now)).toBe("Nonaktif");
    expect(voucherStatusAt({ ...v, startsAt: null, expiresAt: null }, now)).toBe("Aktif");
  });

  it("uses the same deterministic instant for scheduled flash sale boundaries", () => {
    const start = "2026-10-16T10:00:00.000Z";
    const end = "2026-10-16T11:00:00.000Z";
    expect(scheduledFlashStatusAt(start, end, Date.parse("2026-10-16T09:59:59.999Z"))).toBe("Terjadwal");
    expect(scheduledFlashStatusAt(start, end, Date.parse(start))).toBe("Berlangsung");
    expect(scheduledFlashStatusAt(start, end, Date.parse(end))).toBe("Berakhir");
  });
});
