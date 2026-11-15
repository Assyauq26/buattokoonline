import { createHash } from "node:crypto";
import { idr } from "./policy";

type Tag = { tag: string; value: string };
export function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function parse(payload: string): Tag[] {
  if (
    payload.length < 12 ||
    payload.length > 4096 ||
    !/^[\x20-\x7E]+$/.test(payload)
  )
    throw new Error("QRIS harus berupa teks TLV ASCII");
  const tags: Tag[] = [],
    seen = new Set<string>();
  for (let offset = 0; offset < payload.length; ) {
    const header = payload.slice(offset, offset + 4);
    if (!/^\d{4}$/.test(header)) throw new Error("Header TLV tidak valid");
    const tag = header.slice(0, 2),
      length = Number(header.slice(2));
    if (seen.has(tag) || offset + 4 + length > payload.length)
      throw new Error("TLV duplikat atau terpotong");
    seen.add(tag);
    tags.push({ tag, value: payload.slice(offset + 4, offset + 4 + length) });
    offset += 4 + length;
  }
  return tags;
}
function encode(tags: Tag[]) {
  return tags
    .map(
      (t) => `${t.tag}${t.value.length.toString().padStart(2, "0")}${t.value}`,
    )
    .join("");
}
export function validateStaticQris(payload: string) {
  const tags = parse(payload),
    get = (tag: string) => tags.find((t) => t.tag === tag)?.value;
  if (
    tags.at(-1)?.tag !== "63" ||
    !/^[A-F0-9]{4}$/.test(get("63") || "") ||
    crc16(payload.slice(0, -4)) !== get("63")
  )
    throw new Error("Checksum QRIS tidak valid");
  if (
    get("00") !== "01" ||
    get("01") !== "11" ||
    get("53") !== "360" ||
    get("58") !== "ID" ||
    get("54") !== undefined
  )
    throw new Error("Gunakan QRIS statis IDR tanpa nominal");
  if (tags.some((t) => ["55", "56", "57"].includes(t.tag)))
    throw new Error("QRIS dengan biaya tambahan tidak didukung");
  const merchant = tags.filter(
    (t) => Number(t.tag) >= 26 && Number(t.tag) <= 51,
  );
  if (!merchant.length || !get("52") || !get("59") || !get("60"))
    throw new Error("Identitas merchant QRIS belum lengkap");
  for (const t of merchant) {
    const nested = parse(t.value);
    if (!nested.some((n) => n.tag === "00" && /^ID\./i.test(n.value)))
      throw new Error("Identitas QRIS merchant tidak dikenali");
  }
  return {
    tags,
    destination: createHash("sha256").update(encode(merchant)).digest("hex"),
  };
}
export function dynamicQris(payload: string, amount: number) {
  idr(amount);
  const { tags, destination } = validateStaticQris(payload);
  const output = tags
    .filter((t) => t.tag !== "63")
    .map((t) => (t.tag === "01" ? { ...t, value: "12" } : t));
  const position = output.findIndex((t) => Number(t.tag) > 54);
  output.splice(position < 0 ? output.length : position, 0, {
    tag: "54",
    value: String(amount),
  });
  const body = `${encode(output)}6304`;
  return { payload: body + crc16(body), destination };
}
export async function qrisPng(payload: string, amount: number) {
  const bwip = await import("bwip-js/node");
  return bwip.toBuffer({
    bcid: "qrcode",
    text: dynamicQris(payload, amount).payload,
    scale: 5,
    padding: 4,
  });
}
