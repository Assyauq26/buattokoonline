// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { OneClickUpdate } from "@/components/admin/one-click-update";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(extra: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({success:true,data:{
    installedVersion:"1.7.4",checkedAt:1000,catalogError:null,release:null,jobs:[],...extra,
  }})}));
  return render(createElement(OneClickUpdate,{installedVersion:"1.7.4",enabled:true}));
}

it("explains a newer blocked release without offering start or claiming current", async () => {
  mount({availability:{state:"blocked",latest:{version:"1.8.0",sha:"a".repeat(40),notes:""},reason:"worker_upgrade_required"}});
  await screen.findByText(/Versi 1.8.0 tersedia, tetapi belum dapat dipasang/);
  expect(screen.getByText(/meningkatkan layanan updater satu kali/)).toBeTruthy();
  expect(screen.queryByText(/sudah terkini/)).toBeNull();
  expect(screen.queryByRole("button",{name:"Update sekarang"})).toBeNull();
});
it("does not trust an old worker's filtered empty release", async () => {
  mount({});
  await screen.findByText(/Updater lama belum dapat membedakan/);
  expect(screen.queryByText(/sudah terkini/)).toBeNull();
});
it("only reports current after explicit compatible-worker discovery", async () => {
  mount({availability:{state:"current",latest:null,reason:null}});
  await screen.findByText(/Versi toko sudah terkini/);
});
it("catalog failure never reports current", async () => {
  mount({catalogError:"catalog_unavailable",availability:{state:"check_required",latest:null,reason:"catalog_unavailable"}});
  await screen.findByText(/Daftar rilis belum dapat diverifikasi/);
  expect(screen.queryByText(/sudah terkini/)).toBeNull();
});
