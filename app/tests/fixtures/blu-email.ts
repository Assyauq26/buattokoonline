/** Minimal synthetic reconstruction of relevant MIME/DOM structure, not a copy of
 * the owner's original email, personal data, IDs, signatures or tracking content. */
export const BLU_SUBJECT = "Info Transaksi Masuk ke blu Kamu 💸";
export const BLU_HTML = `<!doctype html><html><head><style>table { border: 0 }</style></head><body>
<table><tbody><tr><td><div>Hai <strong>PELANGGAN UJI</strong>,</div>
<div>Ada transaksi masuk ke rekening bluAccount kamu. Ini detailnya:</div>
<div>Nominal Transfer</div><div><span>Rp<span>125.001</span>,00</span></div>
<table><tr><td><div><span>PENGIRIM UJI</span></div><div><span>BCA</span></div></td>
<td><div><span>PENERIMA UJI</span></div><div><span>bluAccount</span></div><div><span>0000 1111 2222</span></div></td></tr></table>
<table><tbody><tr><td><div>Tgl &amp; Jam Transaksi</div></td><td><div><span>14 Nov 2026 10:20:30 WIB</span></div></td></tr>
<tr><td><div>Tipe Transaksi</div></td><td><div><span>BI-FAST</span></div></td></tr></tbody></table>
<div>Notifikasi sintetis untuk pengujian.</div></td></tr></tbody></table></body></html>`;
export const BLU_TEXT =
  "Hai PELANGGAN UJI,\nAda transaksi masuk ke rekening bluAccount kamu. Ini detailnya:\nNominal Transfer\nRp125.001,00\nPENGIRIM UJI\nBCA\nPENERIMA UJI\nbluAccount\n0000 1111 2222\nTgl & Jam Transaksi\n14 Nov 2026 10:20:30 WIB\nTipe Transaksi\nBI-FAST";
function quotedPrintable(text: string) {
  const bytes = Buffer.from(text);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 24)
    lines.push(
      [...bytes.subarray(i, i + 24)]
        .map((b) => "=" + b.toString(16).toUpperCase().padStart(2, "0"))
        .join(""),
    );
  return lines.join("=\r\n");
}
export function syntheticBluEml(
  options: {
    html?: string | null;
    text?: string;
    encoding?: "quoted-printable" | "base64";
    subject?: string;
    from?: string;
    messageId?: string | null;
    headers?: string[];
    closeBoundary?: boolean;
  } = {},
) {
  const encoding = options.encoding || "quoted-printable";
  const encode = (body: string) =>
    encoding === "base64"
      ? Buffer.from(body)
          .toString("base64")
          .match(/.{1,72}/g)!
          .join("\r\n")
      : quotedPrintable(body);
  const headers = [
    `From: blu fixture <${options.from || "synthetic@blubybcadigital.id"}>`,
    "To: fixture@example.test",
    `Subject: =?UTF-8?B?${Buffer.from(options.subject || BLU_SUBJECT).toString("base64")}?=`,
    ...(options.messageId === null
      ? []
      : [
          `Message-ID: ${options.messageId || "<synthetic-blu-0001@example.test>"}`,
        ]),
    "MIME-Version: 1.0",
    `Content-Type: multipart/${options.text !== undefined && options.html !== null ? "alternative" : "mixed"}; boundary="synthetic-blu-mixed"`,
    "Authentication-Results: mx.google.com; dkim=pass header.d=blubybcadigital.id; spf=pass; dmarc=pass",
    "DKIM-Signature: v=1; a=rsa-sha256; d=blubybcadigital.id; s=synthetic; bh=not-a-signature; b=not-a-signature",
    ...(options.headers || []),
  ];
  const parts: string[] = [];
  if (options.html !== null)
    parts.push(
      `--synthetic-blu-mixed\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${encode(options.html ?? BLU_HTML)}`,
    );
  if (options.text !== undefined)
    parts.push(
      `--synthetic-blu-mixed\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${encode(options.text)}`,
    );
  return Buffer.from(
    headers.join("\r\n") +
      "\r\n\r\n" +
      parts.join("\r\n") +
      (options.closeBoundary === false
        ? ""
        : "\r\n--synthetic-blu-mixed--\r\n"),
  );
}
