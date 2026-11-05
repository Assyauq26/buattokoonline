import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { writeAudit } from "@/modules/audit/audit.service";
import { lockShippingSettings } from "@/modules/shipping/shipping-settings.service";
import { decryptJntConfig, jntEnvironment } from "./official-config";
import { districtCodePattern, tariffAreaPattern } from "./verified-mapping";
import { parseMappingFile } from "./mapping-file";

const column = z.number().int().min(0).max(39);
export const mappingColumns = z.object({
  province: column, city: column, district: column, districtCode: column.optional(),
  sendSiteCode: column, originCityCode: column, destAreaCode: column, destinationCityCode: column, receiverArea: column,
}).strict();
type Columns = z.infer<typeof mappingColumns>;
const normalize = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const identity = (province: string, city: string, district: string) => JSON.stringify([province, city, district].map(normalize));
type Region = { code: string; name: string };
let regions: { byName: Map<string, string[]>; byCode: Map<string, string> } | undefined;

function districtIndex() {
  if (regions) return regions;
  const lists = JSON.parse(gunzipSync(readFileSync(join(process.cwd(), "src/modules/regions/data/snapshot.json.gz"))).toString()) as Record<string, { data: Region[] }>;
  const byName = new Map<string, string[]>(), byCode = new Map<string, string>();
  for (const province of lists.provinces.data) {
    for (const city of lists["regencies/" + province.code]?.data ?? []) {
      for (const district of lists["districts/" + city.code]?.data ?? []) {
        const key = identity(province.name, city.name, district.name);
        const codes = byName.get(key) ?? [];
        codes.push(district.code);
        byName.set(key, codes);
        byCode.set(district.code, key);
      }
    }
  }
  return regions = { byName, byCode };
}

export async function inspectMapping(filename: string, file: Buffer, input: {
  sheet?: string; delimiter?: "," | ";"; headerRow: number; columns?: Columns;
}) {
  const parsed = await parseMappingFile(filename, file, input.sheet, input.delimiter);
  const header = parsed.rows.find(row => row.number === input.headerRow)?.cells;
  if (!header?.some(cell => cell?.trim())) throw new HttpError("Baris header tidak ditemukan", 422);
  const checksum = createHash("sha256").update(file).digest("hex");
  const version = createHash("sha256").update(JSON.stringify([checksum, parsed.sheet, input.delimiter ?? ",", input.headerRow,
    input.columns && Object.entries(input.columns).sort()])).digest("hex");
  const body = parsed.rows.filter(row => row.number > input.headerRow && row.cells.some(cell => cell?.trim()));
  const preview = { header: Array.from(header, cell => (cell || "").slice(0, 100)), samples: body.slice(0, 3)
    .map(row => Array.from(row.cells, cell => (cell || "").slice(0, 100))), checksum, version, sheet: parsed.sheet, sheets: parsed.sheets };
  const report = { total: body.length, valid: 0, invalid: 0, ambiguous: 0, duplicate: 0, unmatched: 0,
    issues: [] as Array<{ row: number; reason: string }> };
  const columns = input.columns;
  if (columns && (new Set(Object.values(columns)).size !== Object.values(columns).length ||
      Object.values(columns).some(index => !header[index]?.trim()))) {
    throw new HttpError("Pilih kolom berheader yang berbeda untuk setiap field", 422);
  }
  const rows: Array<Prisma.JntL3MappingCreateManyInput & { sourceRow: number }> = [];
  if (columns) {
    const { byName, byCode } = districtIndex();
    const byDistrict = new Map<string, number>(), byReceiverArea = new Map<string, number>();
    const conflictRows = new Set<number>();
    function issue(row: number, reason: string) {
      if (report.issues.length < 100) report.issues.push({ row, reason });
    }
    for (const { number, cells } of body) {
      const get = (field: keyof Columns) => (cells[columns[field] ?? -1] ?? "").trim();
      const province = get("province"), city = get("city"), district = get("district");
      const sendSiteCode = get("sendSiteCode"), originCityCode = get("originCityCode"), destAreaCode = get("destAreaCode");
      const jntCityCode = get("destinationCityCode"), jntAreaCode = get("receiverArea");
      const code = get("districtCode"), key = identity(province, city, district);
      const matches = code ? (districtCodePattern.test(code) && byCode.get(code) === key ? [code] : []) : (byName.get(key) ?? []);
      if (matches.length !== 1) {
        if (matches.length) report.ambiguous++; else report.unmatched++;
        issue(number, matches.length ? "Wilayah ambigu. Sertakan kode kecamatan internal." : "Hierarki wilayah tidak cocok dengan referensi toko.");
        continue;
      }
      const emsifaDistrictCode = matches[0];
      if (!tariffAreaPattern.test(sendSiteCode) || !tariffAreaPattern.test(destAreaCode) ||
          !/^[A-Z0-9]{3}$/.test(originCityCode) || !/^[A-Z0-9]{3}$/.test(jntCityCode) || !/^[A-Z0-9]{1,10}$/.test(jntAreaCode)) {
        report.invalid++;
        issue(number, "Kode wajib hilang atau tidak valid (sendSiteCode, origin_code, destAreaCode, destination_code, receiver_area).");
        continue;
      }
      for (const [index, value] of [[byDistrict, emsifaDistrictCode], [byReceiverArea, jntAreaCode]] as const) {
        const prior = index.get(value);
        if (prior !== undefined) {
          conflictRows.add(prior); conflictRows.add(number);
        } else index.set(value, number);
      }
      rows.push({ id: version + ":" + jntAreaCode, version, province, city, district, sendSiteCode, originCityCode, destAreaCode,
        jntProvince: "", jntCity: "", jntDistrict: "", jntCityCode, jntAreaCode, emsifaDistrictCode,
        matchStatus: "EXACT", sourceRow: number });
    }
    report.duplicate = conflictRows.size;
    for (const row of conflictRows) issue(row, "Kecamatan atau receiver_area berulang. Verifikasi dengan J&T.");
    report.valid = rows.length - conflictRows.size;
    return { ...preview, report, rows: rows.filter(row => !conflictRows.has(row.sourceRow)) };
  }
  return { ...preview, report, rows };
}

export async function stageMapping(data: Awaited<ReturnType<typeof inspectMapping>>, file: Buffer, filename: string, source: string, actor: string, automatic = false) {
  if (!data.report.total || data.report.valid !== data.report.total) throw new HttpError("Perbaiki semua baris bermasalah sebelum menyimpan versi mapping", 422);
  await prisma.$transaction(async tx => {
    await lockShippingSettings(tx);
    if (await tx.jntMappingImport.findUnique({ where: { version: data.version }, select: { version: true } })) {
      if (automatic) { await activateMappingInTransaction(tx, data.version, actor); return; }
      throw new HttpError("Versi mapping ini sudah tersimpan", 409);
    }
    if (await tx.jntMappingImport.count() >= 25) throw new HttpError("Batas 25 versi mapping tercapai. Hubungi operator untuk arsip.", 409);
    await tx.jntMappingImport.create({ data: { version: data.version, checksum: data.checksum, filename, source,
      uploadedBy: actor, report: data.report, file } });
    for (let i = 0; i < data.rows.length; i += 500) await tx.jntL3Mapping.createMany({ data: data.rows.slice(i, i + 500) });
    await writeAudit({ userId: actor, action: "jnt.mapping.staged", entity: "JntMappingImport", entityId: data.version,
      meta: { rows: data.report.valid } }, tx);
    if (automatic) await activateMappingInTransaction(tx, data.version, actor);
  }, { timeout: 20_000 });
}

export async function activateMapping(version: string, actor: string) {
  await prisma.$transaction(async tx => {
    await lockShippingSettings(tx);
    await activateMappingInTransaction(tx, version, actor);
  }, { timeout: 20_000 });
}

async function activateMappingInTransaction(tx: Prisma.TransactionClient, version: string, actor: string) {
    const current = await tx.jntMappingRelease.findUnique({ where: { key: "primary" } });
    if (current?.activeVersion === version) return;
    // Existing checkout revisions keep their immutable mapping version.
    if (!await tx.jntMappingImport.findUnique({ where: { version }, select: { version: true } })) {
      throw new HttpError("Versi mapping resmi yang telah divalidasi tidak ditemukan", 404);
    }
    const integrations = await tx.jntIntegration.findMany();
    for (const integration of integrations) {
      const config = decryptJntConfig(integration.encryptedConfig, jntEnvironment.parse(integration.environment));
      const district = config.seller?.warehouse.districtCode;
      if (!district) continue;
      const warehouse = await tx.jntL3Mapping.findFirst({ where: { version, emsifaDistrictCode: district, matchStatus: "EXACT" } });
      if (!warehouse?.sendSiteCode || !warehouse.originCityCode) {
        throw new HttpError("Versi ini tidak mencakup kode asal gudang tersimpan di " + integration.environment, 409);
      }
    }
    const approvedAt = new Date();
    await tx.jntL3Mapping.updateMany({ where: { version, matchStatus: "EXACT", approvedAt: null }, data: { approvedAt } });
    const data = { activeVersion: version, approvedBy: actor, approvedAt };
    await tx.jntMappingRelease.upsert({ where: { key: "primary" }, create: { key: "primary", ...data }, update: data });
    await tx.jntIntegration.updateMany({ data: { tariffProof: null } });
    await writeAudit({ userId: actor, action: "jnt.mapping.activated", entity: "JntMappingImport", entityId: version,
      meta: { previousVersion: current?.activeVersion ?? null } }, tx);
}

const headerAliases: Record<keyof Columns, string[]> = {
  province: ["province", "provinsi"], city: ["city", "kabupatenkota", "kotakab", "kabupaten", "kota"],
  district: ["district", "kecamatan"], districtCode: ["districtcode", "kodekecamatan", "emsifadistrictcode"],
  sendSiteCode: ["sendsitecode"], originCityCode: ["origincode", "origincitycode"],
  destAreaCode: ["destareacode"], destinationCityCode: ["destinationcode", "destinationcitycode"],
  receiverArea: ["receiverarea"],
};
export async function inspectAutomaticMapping(filename: string, file: Buffer) {
  const csv = /\.csv$/i.test(filename);
  const first = csv ? { sheets: [] as string[] } : await parseMappingFile(filename, file);
  const candidates: { sheet?: string; delimiter?: "," | ";"; headerRow: number; columns: Columns }[] = [];
  const sheets = first.sheets.length ? first.sheets : [undefined];
  const delimiters: ("," | ";")[] = /\.csv$/i.test(filename) ? [",", ";"] : [","];
  for (const sheet of sheets) for (const delimiter of delimiters) {
    let parsed: Awaited<ReturnType<typeof parseMappingFile>>;
    try { parsed = await parseMappingFile(filename, file, sheet, delimiter); }
    catch (error) { if (csv) continue; throw error; }
    for (const row of parsed.rows.slice(0, 20)) {
      const normalized = row.cells.map(cell => (cell || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
      const found: Partial<Columns> = {};
      let ambiguous = false;
      for (const [key, aliases] of Object.entries(headerAliases)) {
        const indices = normalized.flatMap((header, i) => aliases.includes(header) ? [i] : []);
        if (indices.length > 1) ambiguous = true;
        if (indices.length === 1) found[key as keyof Columns] = indices[0];
      }
      const checked = mappingColumns.safeParse(found);
      if (!ambiguous && checked.success) candidates.push({ sheet, delimiter, headerRow: row.number, columns: checked.data });
    }
  }
  if (candidates.length !== 1) throw new HttpError(candidates.length
    ? "Lebih dari satu tabel mapping ditemukan. Gunakan satu tabel pada template."
    : "Header template tidak lengkap. Gunakan Provinsi, Kota, Kecamatan, sendSiteCode, origin_code, destAreaCode, destination_code, receiver_area.", 422);
  return inspectMapping(filename, file, candidates[0]);
}
