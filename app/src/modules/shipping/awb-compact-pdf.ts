import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import sharp from "sharp";
import bwipjs from "bwip-js/node";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AwbLabel } from "./awb-pdf";
import { maskRecipientPhone } from "./awb-pdf";
const clean = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[^\x20-\x7e\xa0-\xff\u2022]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function awbVariation(value: string) {
  return clean(
    value
      .split(/\s+\/\s+/)
      .map((v) => v.replace(/^[^:]{1,40}:\s*/, ""))
      .join(" • "),
  );
}
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of clean(value).split(" ")) {
    if (font.widthOfTextAtSize(word, size) > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (const ch of word) {
        if (font.widthOfTextAtSize(current + ch, size) > width) {
          lines.push(current);
          current = ch;
        } else current += ch;
      }
    } else if (
      font.widthOfTextAtSize(current + (current ? " " : "") + word, size) >
      width
    ) {
      lines.push(current);
      current = word;
    } else current += (current ? " " : "") + word;
  }
  if (current) lines.push(current);
  return lines;
}
export async function createCompactAwbPdf(data: AwbLabel) {
  const doc = await PDFDocument.create();
  doc.setTitle("J&T AWB " + clean(data.awb));
  doc.setAuthor(clean(data.senderName));
  const w = (75 * 72) / 25.4,
    h = (150 * 72) / 25.4,
    left = 9,
    right = w - 9,
    inner = right - left;
  const normal = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([w, h]);
  const text = (
    value: string,
    x: number,
    y: number,
    size = 8,
    heavy = false,
    p: PDFPage = page,
  ) =>
    p.drawText(clean(value), {
      x,
      y: h - y - size,
      size,
      font: heavy ? bold : normal,
      color: rgb(0, 0, 0),
    });
  const rule = (y: number, p = page) =>
    p.drawLine({
      start: { x: left, y: h - y },
      end: { x: right, y: h - y },
      thickness: 0.65,
      color: rgb(0, 0, 0),
    });
  const center = (value: string, y: number, size: number, heavy = true) => {
    const f = heavy ? bold : normal;
    const s = Math.min(
      size,
      (inner - 10) / Math.max(f.widthOfTextAtSize(clean(value), 1), 1),
    );
    text(value, (w - f.widthOfTextAtSize(clean(value), s)) / 2, y, s, heavy);
  };
  const frame = (p = page) =>
    p.drawRectangle({
      x: left,
      y: 7,
      width: inner,
      height: h - 14,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.9,
    });
  frame();
  const logo = await doc.embedPng(
    await sharp(
      await readFile(
        path.join(process.cwd(), "public/carriers/jnt-express.png"),
      ),
    )
      .modulate({ brightness: 0 })
      .png()
      .toBuffer(),
  );
  const dimensions = logo.scaleToFit(84, 21);
  page.drawImage(logo, {
    x: 17,
    y: h - 31,
    width: dimensions.width,
    height: dimensions.height,
  });
  page.drawLine({
    start: { x: w * 0.69, y: h - 13 },
    end: { x: w * 0.69, y: h - 31 },
    thickness: 0.8,
  });
  const service = clean(data.service) || "-";
  const serviceSize = Math.min(
    17,
    45 / Math.max(bold.widthOfTextAtSize(service, 1), 1),
  );
  text(service, w * 0.76, 13, serviceSize, true);
  rule(38);
  center(
    data.routingCode || "Kode sortir belum tersedia",
    47,
    data.routingCode ? 18 : 7,
  );
  rule(69);
  const senderWidth = inner * 0.66 - 12;
  let size = 8;
  let sender: string[] = [],
    recipient: string[] = [],
    senderH = 0,
    recipientH = 0;
  for (size of [8, 7.5, 7, 6.5, 6]) {
    sender = [
      ...wrap(data.senderName, bold, size, senderWidth),
      ...wrap(data.senderPhone, normal, size, senderWidth),
      ...wrap(data.senderAddress, normal, size, senderWidth),
    ];
    recipient = [
      ...wrap(data.recipientName, bold, size + 1, inner - 14),
      ...wrap(
        maskRecipientPhone(data.recipientPhone),
        normal,
        size,
        inner - 14,
      ),
      ...wrap(data.address, normal, size, inner - 14),
    ];
    senderH = Math.max(58, 22 + sender.length * (size + 2));
    recipientH = Math.max(66, 22 + recipient.length * (size + 2));
    if (senderH + recipientH <= 178) break;
  }
  if (senderH + recipientH > 178)
    throw new Error(
      "Label terlalu panjang: alamat tidak dapat dimuat tanpa memotong data. Hubungi operator.",
    );
  let y = 69;
  text("PENGIRIM", 15, y + 7, 8, true);
  sender.forEach((line, i) =>
    text(line, 15, y + 21 + i * (size + 2), size, i === 0),
  );
  const split = left + inner * 0.68;
  page.drawLine({
    start: { x: split, y: h - y },
    end: { x: split, y: h - y - senderH },
    thickness: 0.7,
  });
  const qr = await doc.embedPng(
    await bwipjs.toBuffer({
      bcid: "qrcode",
      text: data.awb,
      scale: 5,
      padding: 4,
    }),
  );
  const qrSize = Math.min(52, right - split - 8);
  page.drawImage(qr, {
    x: split + (right - split - qrSize) / 2,
    y: h - y - (senderH + qrSize) / 2,
    width: qrSize,
    height: qrSize,
  });
  y += senderH;
  rule(y);
  text("PENERIMA", 15, y + 7, 8, true);
  recipient.forEach((line, i) =>
    text(line, 15, y + 21 + i * (size + 2), i === 0 ? size + 1 : size, i === 0),
  );
  y += recipientH;
  rule(y);
  text(
    "Berat: " + (data.weight / 1000).toFixed(3).replace(".", ",") + " kg",
    15,
    y + 7,
    8,
  );
  text("Tanggal: " + data.date, w * 0.51, y + 7, 7);
  page.drawLine({
    start: { x: w * 0.5, y: h - y },
    end: { x: w * 0.5, y: h - y - 20 },
    thickness: 0.7,
  });
  y += 20;
  rule(y);
  center(data.codAmount ? "COD Rp " + data.codAmount : "NON COD", y + 5, 12);
  y += 23;
  rule(y);
  const barcode = await doc.embedPng(
    await bwipjs.toBuffer({
      bcid: "code128",
      text: data.awb,
      scale: 5,
      height: 18,
      includetext: false,
      paddingwidth: 14,
      paddingheight: 3,
    }),
  );
  page.drawImage(barcode, { x: 15, y: h - y - 55, width: w - 30, height: 48 });
  center(data.awb, y + 59, 12);
  y += 81;
  rule(y);
  const orderLines = wrap("Order ID: " + data.orderNumber, bold, 7, inner - 12);
  orderLines.forEach((line, i) => text(line, 15, y + 5 + i * 8, 7, true));
  y += Math.max(18, orderLines.length * 8 + 8);
  rule(y);
  for (const x of [6.5, w - 6.5])
    for (let i = 0; i < 4; i++) {
      const fontSize = 4.7,
        len = bold.widthOfTextAtSize(clean(data.awb), fontSize),
        cy = 52 + (i * (h - 100)) / 3;
      page.drawText(clean(data.awb), {
        x,
        y: x === 6.5 ? cy - len / 2 : cy + len / 2,
        size: fontSize,
        font: bold,
        rotate: degrees(x === 6.5 ? 90 : 270),
        color: rgb(0, 0, 0),
      });
    }
  const columns = [15, 15 + inner * 0.49, right - 6];
  function tableHeader() {
    text("Nama Barang", columns[0], y + 7, 7, true);
    text("Variasi", columns[1], y + 7, 7, true);
    text(
      "Jumlah",
      columns[2] - bold.widthOfTextAtSize("Jumlah", 7),
      y + 7,
      7,
      true,
    );
    y += 23;
  }
  function continuation() {
    page = doc.addPage([w, h]);
    frame();
    text("RINCIAN LANJUTAN", 15, 15, 10, true);
    text("Bukan label pengiriman tambahan", 15, 30, 7);
    let top = 44;
    for (const line of wrap(
      "Order ID: " + data.orderNumber,
      bold,
      7,
      inner - 12,
    )) {
      text(line, 15, top, 7, true);
      top += 9;
    }
    for (const line of wrap(
      "Referensi resi: " + data.awb,
      normal,
      7,
      inner - 12,
    )) {
      text(line, 15, top, 7);
      top += 9;
    }
    y = top + 8;
    rule(y);
    tableHeader();
  }
  if (y + 35 > h - 12) continuation();
  else tableHeader();
  for (const item of data.items) {
    const names = wrap(item.name, normal, 7, inner * 0.46),
      variations = wrap(
        awbVariation(item.variation || "-"),
        normal,
        7,
        inner * 0.33,
      );
    const height = Math.max(names.length, variations.length, 1) * 9 + 9;
    if (height > h - 110)
      throw new Error(
        "Label terlalu panjang: rincian satu barang memerlukan penanganan operator.",
      );
    if (y + height > h - 12) continuation();
    names.forEach((line, i) => text(line, columns[0], y + i * 9, 7));
    variations.forEach((line, i) => text(line, columns[1], y + i * 9, 7));
    text(
      String(item.quantity),
      columns[2] - bold.widthOfTextAtSize(String(item.quantity), 8),
      y,
      8,
      true,
    );
    y += height;
  }
  return doc.save();
}
