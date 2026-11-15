import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only",()=>({}));
import { requestGoPayOtp,verifyGoPayOtp,readGoPayPage } from "@/modules/payments/evidence/gopay-client";
import { decodeQrisImage } from "@/modules/payments/evidence/qris-image";
import { crc16 } from "@/modules/payments/evidence/qris";
import sharp from "sharp";
afterEach(()=>vi.unstubAllGlobals());
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
it("uses only the documented historical OTP payload and never returns tokens from errors",async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response({otp_token:"synthetic-challenge"})).mockResolvedValueOnce(response({data:{access_token:"synthetic-access",expires_in:3600}}));
  vi.stubGlobal("fetch",mock);
  expect(await requestGoPayOtp("6281234567890")).toEqual({otp_token:"synthetic-challenge"});
  const [url,init]=mock.mock.calls[0];expect(url).toBe("https://api.gobiz.co.id/goid/login/request");
  expect(JSON.parse(init.body)).toEqual({phone_number:"81234567890",country_code:"62",client_id:"go-biz-web-new"});
  expect(init.redirect).toBe("error");
  expect((await verifyGoPayOtp("123456","synthetic-challenge")).expires_in).toBe(3600);
});
it("rejects missing OTP challenges and unknown responses without fabricated success",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>response({success:true})));
  await expect(requestGoPayOtp("6281234567890")).rejects.toThrow("Kontrak challenge");
  await expect(verifyGoPayOtp("123456","synthetic-challenge")).rejects.toThrow("kontrak");
});
it("paginates beyond the first 50 and rejects expired merchant sessions",async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response({transactions:Array.from({length:50},(_,id)=>({id}))})).mockResolvedValueOnce(response({transactions:[{id:51}]})).mockResolvedValueOnce(response({secret:"must-not-leak"},401));
  vi.stubGlobal("fetch",mock);const start=new Date("2026-11-01T00:00:00Z"),end=new Date("2026-11-02T00:00:00Z");
  expect((await readGoPayPage("synthetic","merchant",start,end)).nextOffset).toBe(50);
  expect((await readGoPayPage("synthetic","merchant",start,end,50)).nextOffset).toBeNull();
  expect(new URL(mock.mock.calls[1][0]).searchParams.get("from")).toBe("50");
  await expect(readGoPayPage("synthetic","merchant",start,end)).rejects.toThrow("dihubungkan ulang");
});
const tlv=(id:string,value:string)=>id+String(value.length).padStart(2,"0")+value;
const body=tlv("00","01")+tlv("01","11")+tlv("26",tlv("00","ID.CO.TEST")+tlv("01","fixture"))+tlv("52","5999")+tlv("53","360")+tlv("58","ID")+tlv("59","SYNTHETIC STORE")+tlv("60","TEST CITY")+"6304";
it("decodes PNG/JPEG/WebP locally and validates the recovered merchant payload",async()=>{
  const bwip=await import("bwip-js/node");const payload=body+crc16(body);
  const png=await bwip.toBuffer({bcid:"qrcode",text:payload,scale:5,padding:8});
  for(const format of ["png","jpeg","webp"] as const){const image=await sharp(png).flatten({ background:"white" }).toFormat(format).toBuffer();
    expect(await decodeQrisImage(image,"image/"+format)).toMatchObject({payload,merchantName:"SYNTHETIC STORE"});}
  await expect(decodeQrisImage(png,"image/jpeg")).rejects.toThrow();
});
it("rejects oversized, corrupt and non-QR images",async()=>{
  await expect(decodeQrisImage(Buffer.alloc(4*1024*1024+1),"image/png")).rejects.toThrow("4 MB");
  const empty=await sharp({create:{width:256,height:256,channels:3,background:"white"}}).png().toBuffer();
  await expect(decodeQrisImage(empty,"image/png")).rejects.toThrow("tidak terbaca");
});
