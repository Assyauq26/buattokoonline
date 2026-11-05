import "server-only";
import { parse } from "csv-parse/sync";
import { SaxesParser } from "saxes";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { HttpError } from "@/lib/http-error";

export const maxMappingBytes = 2 * 1024 * 1024;
const maxExpandedBytes = 16 * 1024 * 1024;
export const maxMappingRows = 12_000;
const maxColumns = 40;
type Row = { number: number; cells: string[] };

function invalid(message: string): never { throw new HttpError(message, 422); }
function xml(source: string, callbacks: { open?: (name: string, attributes: Record<string, string>) => void; text?: (value: string) => void; close?: (name: string) => void }) {
  const parser = new SaxesParser();
  parser.on("doctype", () => invalid("DTD dan entitas eksternal tidak didukung"));
  parser.on("opentag", tag => callbacks.open?.(tag.name.split(":").pop()!, tag.attributes));
  parser.on("text", value => callbacks.text?.(value));
  parser.on("closetag", tag => callbacks.close?.(tag.name.split(":").pop()!));
  parser.write(source).close();
}

async function workbook(file: Buffer, selectedSheet?: string) {
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(file, {
    lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true,
  }, (error, result) => error ? reject(error) : resolve(result)));
  try {
    const entries = await new Promise<Map<string, Entry>>((resolve, reject) => {
      const found = new Map<string, Entry>();
      let total = 0;
      zip.on("error", reject);
      zip.on("end", () => resolve(found));
      zip.on("entry", (entry: Entry) => {
        total += entry.uncompressedSize;
        if (total > maxExpandedBytes || found.size >= 128 || found.has(entry.fileName) ||
            (entry.generalPurposeBitFlag & 1) || /(?:vbaProject|externalLinks|embeddings|macrosheets|activeX)/i.test(entry.fileName)) {
          reject(new Error("Unsafe XLSX archive"));
          return;
        }
        found.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.readEntry();
    });
    async function read(path: string) {
      const entry = entries.get(path);
      if (!entry) return "";
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
        zip.openReadStream(entry, (error, result) => error ? reject(error) : resolve(result)));
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const item of stream) {
        const chunk = Buffer.isBuffer(item) ? item : Buffer.from(item);
        total += chunk.length;
        if (total > entry.uncompressedSize || total > maxExpandedBytes) invalid("Ukuran dekompresi XLSX melampaui batas");
        chunks.push(chunk);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    }
    const paths = new Map<string, string>();
    xml(await read("xl/_rels/workbook.xml.rels"), { open(name, attrs) {
      if (name !== "Relationship") return;
      if (attrs.TargetMode === "External") invalid("Tautan eksternal XLSX tidak didukung");
      if (/^(?:\/xl\/)?worksheets\/sheet[\w-]+\.xml$/.test(attrs.Target || "")) {
        paths.set(attrs.Id, attrs.Target.startsWith("/") ? attrs.Target.slice(1) : "xl/" + attrs.Target);
      }
    } });
    const sheets = new Map<string, string>();
    xml(await read("xl/workbook.xml"), { open(name, attrs) {
      if (name === "sheet" && paths.has(attrs["r:id"])) {
        if (sheets.has(attrs.name) || sheets.size >= 12) invalid("XLSX melebihi batas sheet atau nama sheet berulang");
        sheets.set(attrs.name, paths.get(attrs["r:id"])!);
      }
    } });
    const sheet = selectedSheet ?? sheets.keys().next().value;
    const path = sheet && sheets.get(sheet);
    if (!path) invalid("Sheet XLSX tidak ditemukan");
    const strings: string[] = [];
    let value = "", capture = false;
    const shared = await read("xl/sharedStrings.xml");
    if (shared) xml(shared, {
      open(name) { if (name === "si") value = ""; if (name === "t") capture = true; },
      text(text) { if (capture) value += text; },
      close(name) {
        if (name === "t") capture = false;
        if (name === "si") {
          if (strings.length >= 150_000 || value.length > 512) invalid("Teks XLSX melebihi batas");
          strings.push(value);
        }
      },
    });
    const rows: Row[] = [];
    let row: Row | undefined, column = -1, kind = "";
    xml(await read(path), {
      open(name, attrs) {
        if (name === "f") invalid("Formula tidak didukung dalam sheet mapping");
        if (name === "row") {
          const number = Number(attrs.r);
          if (!Number.isInteger(number) || number < 1 || number > maxMappingRows + 1 || (rows.at(-1)?.number ?? 0) >= number) invalid("Nomor baris XLSX melampaui batas atau tidak berurutan");
          row = { number, cells: [] };
        }
        if (name === "c" && row) {
          const ref = /^([A-Z]{1,2})(\d+)$/.exec(attrs.r || "");
          if (!ref || Number(ref[2]) !== row.number) invalid("Referensi sel XLSX tidak valid");
          column = [...ref[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
          if (column >= maxColumns || row.cells[column] !== undefined) invalid("Kolom XLSX melampaui batas atau berulang");
          value = "";
          kind = attrs.t || "";
          if (!["", "n", "s", "inlineStr", "str"].includes(kind)) invalid("Jenis sel XLSX tidak didukung");
        }
        if (name === "v" || name === "t") capture = true;
      },
      text(text) { if (capture) value += text; },
      close(name) {
        if (name === "v" || name === "t") capture = false;
        if (name === "c" && row && column >= 0) {
          const cell = kind === "s" ? (/^\d+$/.test(value) ? strings[Number(value)] : undefined) : value;
          if (cell === undefined || cell.length > 512) invalid("Teks sel XLSX tidak valid");
          row.cells[column] = cell;
          column = -1;
        }
        if (name === "row" && row) { rows.push(row); row = undefined; }
      },
    });
    return { rows, sheet, sheets: [...sheets.keys()] };
  } finally { zip.close(); }
}

export async function parseMappingFile(filename: string, file: Buffer, sheet?: string, delimiter: "," | ";" = ",") {
  if (!file.length || file.length > maxMappingBytes) throw new HttpError("Batas ukuran file mapping 2 MiB", 413);
  try {
    if (/\.xlsx$/i.test(filename) && file.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
      return await workbook(file, sheet);
    }
    if (/\.csv$/i.test(filename)) {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(file);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source)) invalid("CSV harus berupa teks UTF-8");
      const rows: Row[] = [];
      parse(source, { bom: true, delimiter, max_record_size: 4096, skip_empty_lines: true, relax_column_count: true,
        on_record(cells: string[], info) {
          if (rows.length > maxMappingRows || cells.length > maxColumns || cells.some(cell => cell.length > 512)) invalid("Jumlah baris, kolom, atau panjang sel melampaui batas");
          rows.push({ number: info.lines, cells });
          return null;
        },
      });
      return { rows, sheet: undefined, sheets: [] as string[] };
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    invalid("File mapping rusak atau formatnya tidak didukung");
  }
  return invalid("Unggah CSV UTF-8 atau XLSX yang valid");
}
