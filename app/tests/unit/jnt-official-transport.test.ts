import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/shipping/jnt/pinned-https", () => ({
  postPinnedJnt: (url: string, body: string, headers: Record<string, string>) =>
    fetch(url, { method: "POST", body, headers, redirect: "error" }),
}));
vi.mock("@/infrastructure/shipping/jnt/official-config", () => ({
  activeJntConfig: vi.fn(async () => ({
    endpoints: {
      tariff: "https://partner-track.jet.co.id/jandt_track/inquiry.action",
      order: "https://api.jet.co.id/jts-idn-ecommerce-api/api/order/create",
      cancellation: "https://api.jet.co.id/jts-idn-ecommerce-api/api/order/cancel",
      tracking: "https://partner-track.jet.co.id/jandt_track/track/trackAction!tracking.action",
    },
    credentials: {
      tariffCustomer: "SYNTHETIC-CUSTOMER", tariffKey: "SYNTHETIC-KEY",
      orderUsername: "SYNTHETIC-USERNAME", orderApiKey: "SYNTHETIC-API-KEY",
      orderKey: "SYNTHETIC-SIGNING-KEY",
      trackingUsername: "SYNTHETIC-USERNAME", trackingPassword: "SYNTHETIC-PASSWORD",
    },
  })),
}));
import { checkJntRate, createJntOrder, cancelJntOrder, trackJntOrder, officialJntSignature } from "@/infrastructure/shipping/jnt/official-transport";

afterEach(() => { vi.unstubAllGlobals(); });
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
describe("official J&T API transport (network mocked)", () => {
  it("cancels oversized chunked responses without buffering the full body", async () => {
    const cancelled = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(32768)); }, cancel: cancelled,
    }))));
    await expect(checkJntRate({ originSite: "BATANG", destinationArea: "WARUNGASEM", weightGram: 3000, productType: "EZ" })).rejects.toThrow(/terlalu besar/);
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("signs ASCII MD5 hex rather than raw digest bytes", () => {
    const hash = officialJntSignature("{}", "secret");
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(hash, "base64").toString("utf8")).toMatch(/^[a-f0-9]{32}$/);
  });
  it("accepts only matching HBO production rates, never a default or fake price", async () => {
    const mock = vi.fn().mockResolvedValue(respond({
      is_success: "true", message: "",
      content: JSON.stringify([{ cost: "14500", name: "HBO", productType: "HBO" }]),
    }));
    vi.stubGlobal("fetch", mock);
    expect(await checkJntRate({ originSite: "BATANG", destinationArea: "WARUNGASEM", weightGram: 3000, productType: "HBO" }))
      .toEqual([{ courier: "J&T Express", service: "HBO", cost: 14500, mode: "official" }]);
    const [url, options] = mock.mock.calls[0];
    expect(url).toContain("partner-track.jet.co.id");
    const form = new URLSearchParams(options.body as URLSearchParams);
    expect(JSON.parse(form.get("data") || "{}")).toMatchObject({
      sendSiteCode: "BATANG", destAreaCode: "WARUNGASEM", weight: "3", productType: "HBO",
    });
    expect(form.get("sign")).toBe(officialJntSignature(form.get("data") || "", "SYNTHETIC-KEY"));
    expect(options.redirect).toBe("error");
    mock.mockResolvedValueOnce(respond({ is_success: "true", content: JSON.stringify([{ name: "EZ", cost: "14500" }]) }));
    await expect(checkJntRate({ originSite: "BATANG", destinationArea: "WARUNGASEM", weightGram: 3000, productType: "HBO" })).rejects.toThrow();
    mock.mockResolvedValueOnce(respond({ is_success: "true", content: JSON.stringify([{ name: "HBO", cost: "-10" }]) }));
    await expect(checkJntRate({ originSite: "BATANG", destinationArea: "WARUNGASEM", weightGram: 3000, productType: "HBO" })).rejects.toThrow();
  });
  const createPayload = {
    orderid: "GHV-TEST-001", shipper_name: "Seller", shipper_contact: "Seller",
    shipper_phone: "+6281234567890", shipper_addr: "Warehouse Test Street",
    origin_code: "BGG", receiver_name: "Customer", receiver_phone: "+6281234567891",
    receiver_addr: "Customer Test Street", receiver_zip: "12345", destination_code: "JKT",
    receiver_area: "JKT002", qty: 1, weight: 1, goodsdesc: "CLOTHING", servicetype: 1 as const,
    insurance: 0, orderdate: "2026-10-31 10:00:00", item_name: "JACKET", cod: 0,
    sendstarttime: "2026-10-31 12:00:00", sendendtime: "2026-10-31 17:00:00",
    expresstype: "1" as const, goodsvalue: 50000,
  };
  it("parses successful AWB with exact matching orderid", async () => {
    const mock = vi.fn().mockResolvedValue(respond({
      success: true, detail: [{ orderid: "GHV-TEST-001", status: "Sukses", awb_no: "JO9001348812" }],
    }));
    vi.stubGlobal("fetch", mock);
    expect(await createJntOrder(createPayload)).toEqual({ orderId: "GHV-TEST-001", awb: "JO9001348812" });
    const body = new URLSearchParams(mock.mock.calls[0][1].body);
    const signed = JSON.parse(body.get("data_param") || "{}");
    expect(signed.detail[0]).toMatchObject({ username: "SYNTHETIC-USERNAME", api_key: "SYNTHETIC-API-KEY", destination_code: "JKT", expresstype: "1" });
    expect(body.get("data_sign")).toBe(officialJntSignature(body.get("data_param") || "", "SYNTHETIC-SIGNING-KEY"));
    mock.mockResolvedValueOnce(respond({ success: true, detail: [{ orderid: "OTHER", status: "Sukses", awb_no: "JO9001348812" }] }));
    await expect(createJntOrder(createPayload)).rejects.toThrow(/tidak mengonfirmasi/);
  });
  it("does not mistake HTTP 200 and success true for accepted cancellation", async () => {
    const mock = vi.fn().mockResolvedValue(respond({
      success: true, detail: [{ orderid: "GHV-TEST-001", status: "Error", reason: "GOT" }],
    }));
    vi.stubGlobal("fetch", mock);
    await expect(cancelJntOrder("GHV-TEST-001", "Cancelled by seller")).rejects.toThrow();
    mock.mockResolvedValueOnce(respond({ success: true, detail: [{ orderid: "GHV-TEST-001", status: "Sukses" }] }));
    await expect(cancelJntOrder("GHV-TEST-001", "Cancelled by seller")).resolves.toMatchObject({ cancelled: true });
  });
  it("handles sanitized real-shaped production history without exposing private delivery data", async () => {
    const fixture = {
      awb: "JO9001348812", orderid: "SYNTHETIC-ORDER",
      detail: {
        actual_amount: 11900, services_code: "EZ",
        receiver: { name: "PRIVATE-RECEIVER", addr: "PRIVATE-ADDRESS" },
        delivDriver: { phone: "PRIVATE-DRIVER-PHONE" },
      },
      history: [
        { status_code: 101, status: "Manifes", city_name: "BATANG", date_time: "2026-10-21 10:09:54" },
        { status_code: 100, status: "Paket dalam perjalanan", city_name: "SEMARANG", date_time: "2026-10-21 23:21:16" },
        { status_code: 150, status: "Paket disimpan di gudang", city_name: "CIBINONG", date_time: "2026-10-23 07:03:05" },
        { status_code: 100, status: "Paket akan dikirim", city_name: "CIBINONG", date_time: "2026-10-23 07:06:15" },
        { status_code: 200, status: "Paket telah diterima", city_name: "CIBINONG",
          date_time: "2026-10-23 09:39:49", receiver: "PRIVATE-RECEIVER", driverPhone: "PRIVATE-DRIVER-PHONE" },
      ],
    };
    const mock = vi.fn().mockResolvedValue(respond(fixture));
    vi.stubGlobal("fetch", mock);
    const result = await trackJntOrder(fixture.awb, "SYNTHETIC-ORDER");
    expect(result.events).toHaveLength(5);
    expect(result.events.map(event => event.status)).toEqual([
      "Manifes", "Paket dalam perjalanan", "Paket disimpan di gudang",
      "Paket akan dikirim", "Paket telah diterima",
    ]);
    expect(result.events.at(-1)).toEqual({
      status: "Paket telah diterima", time: "2026-10-23 09:39:49", note: "CIBINONG",
    });
    for (const secret of ["PRIVATE-RECEIVER", "PRIVATE-DRIVER-PHONE", "PRIVATE-ADDRESS"]) {
      expect(JSON.stringify(result)).not.toContain(secret);
    }
    mock.mockResolvedValueOnce(respond({ awb: fixture.awb, history: fixture.history }));
    await expect(trackJntOrder(fixture.awb, "SYNTHETIC-ORDER")).rejects.toThrow(/tidak cocok/);
    mock.mockResolvedValueOnce(respond({ ...fixture, orderid: "OTHER-ORDER" }));
    await expect(trackJntOrder(fixture.awb, "SYNTHETIC-ORDER")).rejects.toThrow(/tidak cocok/);
    mock.mockResolvedValueOnce(respond({ error_id: "404", error_message: "Invalid AWB number", awb: fixture.awb }));
    await expect(trackJntOrder(fixture.awb, "SYNTHETIC-ORDER")).rejects.toThrow();
  });
  it("uses Basic Authorization for tracking and keeps AWB in JSON body", async () => {
    const mock = vi.fn().mockResolvedValue(respond({ awb: "JO9001348812", orderid: "SO-TEST-ID", detail: { receiver: { phone: "SECRET-PHONE" } }, history: [{ status: "Paket diproses", date_time: "2026-10-31 10:30:00", city_name: "JAKARTA", driverPhone: "SECRET-PHONE" }] }));
    vi.stubGlobal("fetch", mock);
    const result = await trackJntOrder("JO9001348812");
    expect(result).toMatchObject({ awb: "JO9001348812", events: [{ status: "Paket diproses", time: "2026-10-31 10:30:00", note: "JAKARTA" }] });
    expect(JSON.stringify(result)).not.toContain("SECRET-PHONE");
    const [, options] = mock.mock.calls[0];
    expect(options.headers.Authorization).toBe("Basic " + Buffer.from("SYNTHETIC-USERNAME:SYNTHETIC-PASSWORD").toString("base64"));
    expect(JSON.parse(options.body)).toEqual({ awb: "JO9001348812", eccompanyid: "SYNTHETIC-USERNAME" });
  });
});
