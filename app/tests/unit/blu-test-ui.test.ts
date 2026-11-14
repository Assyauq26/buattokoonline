// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BluTransferTest } from "@/components/admin/blu-transfer-test";
const now = new Date().toISOString();
const test = { id: "test-a", sourceId: "source-a", orderNumber: "BLU-TEST-SYNTHETIC", baseAmount: 1000,
  uniqueCode: 1, payable: 1001, createdAt: now, expiresAt: new Date(Date.now()+600000).toISOString(), closed: false,
  matches: [] as string[], bank: { name: "Synthetic bank", number: "0000000000", holder: "Fixture only" } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function view(tests = [] as typeof test[], sources = [{ id: "source-a", label: "Synthetic source" }]) {
  return render(createElement(BluTransferTest,{initialTests:tests,sources,serverNow:now}));
}
it("does not call Gmail in the background or issue on render", () => {
  const fetch = vi.fn();vi.stubGlobal("fetch",fetch);view();expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"Terbitkan nominal uji"})).toBeDefined();
});
it("blocks another issuance while an attempt is active", () => {
  view([test]);expect((screen.getByRole("button",{name:"Masih ada uji aktif"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Rp 1.001",{exact:false})).toBeDefined();
});
it("does not offer transfer/copy after expiry and explains late reads", () => {
  view([{...test,expiresAt:new Date(Date.now()-1000).toISOString()}]);
  expect(screen.queryByRole("button",{name:"Salin nominal"})).toBeNull();
  expect(screen.queryByText(test.bank.number)).toBeNull();
  expect(screen.getByText(/waktu transaksi, bukan waktu pembacaan/)).toBeDefined();
});
it("shows match and ambiguity as review outcomes, never a paid action", () => {
  const rendered=view([{...test,matches:["evidence-a"]}]);
  expect(screen.getByText(/Jangan transfer ulang/)).toBeDefined();
  expect(screen.queryByRole("button",{name:/lunasi/i})).toBeNull();
  rendered.unmount();view([{...test,matches:["evidence-a","evidence-b"]}]);
  expect(screen.getByText("Ambigu · periksa manual")).toBeDefined();
});
it("issues with one stable UUID and refreshes after success", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({success:true,data:{id:test.id}})})
    .mockResolvedValueOnce({ok:true,json:async()=>({success:true,data:{tests:[test],serverNow:now}})});
  vi.stubGlobal("fetch",fetch);view();
  fireEvent.click(screen.getByRole("button",{name:"Terbitkan nominal uji"}));
  await waitFor(()=>expect(screen.getByText(/Pesanan uji diterbitkan/)).toBeDefined());
  const body=JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.action).toBe("create-test");expect(body.input.baseAmount).toBe(1000);
  expect(body.input.windowMinutes).toBe(10);expect(body.input.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
