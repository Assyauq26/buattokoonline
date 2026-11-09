// @vitest-environment jsdom
import { movementLabel } from "../../src/components/admin/movement-label";
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OperationNotice } from "../../src/components/admin/operation-notice";
import { OperationForm } from "../../src/components/admin/operation-form";
import { operationPayload } from "../../src/components/admin/operation-payload";
import { stockAdjustmentSchema, pageNumber } from "../../src/modules/inventory/inventory.validation";
import { manualShipmentOptions, shipmentOrderTarget } from "../../src/modules/shipping/shipping-policy";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("../../src/components/admin/operation-navigation", () => ({ reloadOperationPage: refresh, OPERATION_NOTICE_KEY: "store:operation-saved" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
vi.stubGlobal("React", React);
afterEach(() => { cleanup(); history.replaceState({}, "", "/"); sessionStorage.clear(); vi.unstubAllGlobals(); vi.stubGlobal("React", React); refresh.mockClear(); });
const fields = [{ name: "reason", label: "Alasan", required: true }];
function form() { return render(React.createElement(OperationForm, { url: "/api/test", label: "Simpan", confirmation: "Pastikan data benar.", fields, requestId: true })); }
async function confirm() { fireEvent.change(screen.getByLabelText("Alasan *"), { target: { value: "Koreksi" } }); fireEvent.submit(screen.getByRole("form", { name: "Simpan" })); await screen.findByText("Pastikan data benar."); fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button",{name:"Simpan"})); }
describe("operations forms", () => {
  it("shows a one-time success notice only for the recently saved page", () => {
    sessionStorage.setItem("store:operation-saved", JSON.stringify({ path: location.pathname, at: Date.now() })); const view = render(React.createElement(OperationNotice));
    expect(screen.getByRole("status").textContent).toContain("Data terbaru sudah dimuat"); expect(sessionStorage.getItem("store:operation-saved")).toBeNull(); history.pushState({}, "", "/different"); view.rerender(React.createElement(OperationNotice)); expect(screen.queryByRole("status")).toBeNull();
  });
  it("does not announce an expired or different-page success", () => {
    sessionStorage.setItem("store:operation-saved", JSON.stringify({ path: "/other-page", at: Date.now() - 120000 })); render(React.createElement(OperationNotice)); expect(screen.queryByRole("status")).toBeNull();
  });
  it("requires confirmation before mutation and reports success", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }); vi.stubGlobal("fetch", fetch); form();
    fireEvent.change(screen.getByLabelText("Alasan *"),{target:{value:"Koreksi"}});fireEvent.submit(screen.getByRole("form", { name: "Simpan" })); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button",{name:"Simpan"})); await screen.findByRole("status"); expect(refresh).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledWith(true); expect(fetch).toHaveBeenCalledOnce();
  });
  it("prevents overlapping submits", async () => {
    let finish!: (value: unknown) => void; const fetch = vi.fn(() => new Promise(r => { finish = r; })); vi.stubGlobal("fetch", fetch); form(); await confirm();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Memproses…"})); expect(fetch).toHaveBeenCalledOnce();
    finish({ ok: true, json: async () => ({ success: true }) }); await screen.findByRole("status");
  });
  it("shows field validation and conflict recovery with focus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false, error: { message: "Stok berubah", details: { fieldErrors: { reason: ["Alasan wajib"] } } } }) })); form(); await confirm();
    expect((await screen.findByRole("alert")).textContent).toContain("Muat ulang data"); expect(screen.getByText("Alasan wajib")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
  });
  it("preserves idempotency key when retrying an uncertain network outcome", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, json: async () => ({ success: true }) }); vi.stubGlobal("fetch", fetch); form(); await confirm(); await screen.findByRole("alert"); fireEvent.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Simpan"})); await screen.findByRole("status");
    expect(JSON.parse(fetch.mock.calls[0][1].body).requestId).toBe(JSON.parse(fetch.mock.calls[1][1].body).requestId);
  });
});
describe("shared input and policy", () => {
  it("describes stock effects instead of labeling a sale as an increase", () => { expect(movementLabel("SALE", 1)).toBe("Fisik −1 · reservasi −1"); expect(movementLabel("RELEASE", 1)).toBe("Reservasi −1"); expect(movementLabel("RESERVATION", 1)).toBe("Reservasi +1"); expect(movementLabel("ADJUSTMENT", -2)).toBe("Fisik −2"); expect(movementLabel("RETURN", 2)).toBe("Fisik +2"); });
  it("requires expected stock, bounded integers and a meaningful adjustment reason", () => {
    expect(stockAdjustmentSchema.safeParse({ newOnHand: 5, reason: "count" }).success).toBe(false);
    for (const n of [-1, 1.5, 2147483648]) expect(stockAdjustmentSchema.safeParse({ expectedOnHand: 2, newOnHand: n, reason: "count" }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ expectedOnHand: 2, newOnHand: 5, reason: "  " }).success).toBe(false);
    expect(stockAdjustmentSchema.parse({ expectedOnHand: 2, newOnHand: 5, reason: " count " }).reason).toBe("count");
  });
  it("normalizes untrusted page values", () => { for (const p of ["NaN", "0", "-2", "1.1", "Infinity"]) expect(pageNumber(p)).toBe(1); expect(pageNumber("99999999")).toBe(100000); });
  it("serializes only selected physical quantities and uses ISO settlement times", () => {
    const fd = new FormData(); fd.set("item:a", "0"); fd.set("item:b", "2"); fd.set("receivedAt", "2026-10-01T12:00"); fd.set("physicalReturnVerified", "on"); fd.set("amount", "");
    expect(operationPayload(fd, ["amount"], ["receivedAt"], true)).toEqual({ items: [{ orderItemId: "b", quantity: 2 }], receivedAt: new Date("2026-10-01T12:00").toISOString(), physicalReturnVerified: true, amount: null });
  });
  it("derives shipment choices from the same policy as the writer", () => {
    const context = { status: "PAID" as const, paymentStatus: "PAID" as const, paymentStatusActual: "PAID" as const, shipmentStatus: null };
    expect(manualShipmentOptions(context)).toEqual(["PENDING", "PROCESSING"]); expect(() => shipmentOrderTarget(context, "SHIPPED")).toThrow();
    expect(manualShipmentOptions({ ...context, status: "REFUNDED", paymentStatus: "REFUNDED", paymentStatusActual: "REFUNDED", shipmentStatus: "SHIPPED" })).toEqual(["IN_TRANSIT", "DELIVERED"]);
  });
});
