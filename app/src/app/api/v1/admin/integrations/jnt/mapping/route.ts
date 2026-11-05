import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { getCurrentUser } from "@/lib/auth/session";

import { consumeAuthBucket } from "@/lib/auth/rate-limit";

import { assertSameOrigin } from "@/lib/mutation-origin";

import { handle, HttpError, ok } from "@/lib/response";

import { isJntSettingsAdministrator } from "@/infrastructure/shipping/jnt/official-config";

import { readJntBytes, readJntJson } from "@/infrastructure/shipping/jnt/request-body";

import { activateMapping, inspectAutomaticMapping, inspectMapping, mappingColumns, stageMapping } from "@/infrastructure/shipping/jnt/mapping-import";

import { maxMappingBytes, maxMappingRows } from "@/infrastructure/shipping/jnt/mapping-file";



export const dynamic = "force-dynamic";

let processingUpload = false;

const version = z.string().regex(/^[a-f0-9]{64}$/);

const options = z.object({

  filename: z.string().min(5).max(180).regex(/^[^/\\\p{Cc}]+\.(?:xlsx|csv)$/iu),

  sheet: z.string().max(80).optional(),

  headerRow: z.number().int().min(1).max(maxMappingRows).default(1),

  automatic: z.boolean().optional(),

  delimiter: z.enum([",", ";"]).optional(),

  columns: mappingColumns.optional(),

  stage: z.object({ reviewedVersion: version, source: z.string().trim().min(8).max(240), official: z.literal(true) }).strict().optional(),

}).strict();



async function admin() {

  const user = await getCurrentUser(false);

  if (!user) throw new HttpError("Harap login", 401);

  if (!isJntSettingsAdministrator(user)) throw new HttpError("Akses mapping ditolak", 403);

  return user;

}



function result(data: unknown) {

  const response = ok(data);

  response.headers.set("Cache-Control", "private, no-store");

  return response;

}



export async function GET(req: Request) {

  return handle(async () => {

    await admin();

    const search = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);

    const release = await prisma.jntMappingRelease.findUnique({ where: { key: "primary" } });

    if (search) {

      if (!release) return result({ districts: [] });

      const districts = await prisma.jntL3Mapping.findMany({

        where: { version: release.activeVersion, approvedAt: { not: null }, matchStatus: "EXACT",

          sendSiteCode: { not: null }, originCityCode: { not: null }, destAreaCode: { not: null },

          OR: ["province", "city", "district", "emsifaDistrictCode"].map(field => ({ [field]: { contains: search, mode: "insensitive" } })) },

        select: { province: true, city: true, district: true, emsifaDistrictCode: true, sendSiteCode: true, originCityCode: true },

        orderBy: [{ province: "asc" }, { city: "asc" }, { district: "asc" }], take: 30,

      });

      return result({ districts });

    }

    const versions = await prisma.jntMappingImport.findMany({ select: { version: true, filename: true, uploadedAt: true,

      checksum: true, source: true, report: true }, orderBy: { uploadedAt: "desc" } });

    return result({ activeVersion: release?.activeVersion ?? null, versions });

  });

}



export async function POST(req: Request) {

  return handle(async () => {

    assertSameOrigin(req);

    const actor = await admin();

    const minute = Math.floor(Date.now() / 60000);

    await consumeAuthBucket("jnt-map:" + minute + ":" + actor.id, 6, new Date((minute + 2) * 60000));

    const raw = req.headers.get("x-jnt-mapping-options") || "";

    if (raw.length > 4096 || req.headers.get("content-type") !== "application/octet-stream") throw new HttpError("Format upload mapping tidak valid", 422);

    let data: unknown;

    try { data = JSON.parse(decodeURIComponent(raw)); } catch { throw new HttpError("Opsi mapping tidak valid", 422); }

    const input = options.parse(data);

    if (processingUpload) throw new HttpError("Import mapping lain sedang diproses. Coba lagi.", 429);

    processingUpload = true;

    try {

      const file = await readJntBytes(req, maxMappingBytes);

      const parsed = input.automatic ? await inspectAutomaticMapping(input.filename, file) : await inspectMapping(input.filename, file, input);

      if (input.automatic) {

        if (!parsed.report.total || parsed.report.valid !== parsed.report.total) {

          throw new HttpError("Mapping belum sesuai: " + parsed.report.issues.slice(0, 3).map(i => "baris " + i.row + " · " + i.reason).join("; "), 422);

        }

        await stageMapping(parsed, file, input.filename, "Upload template oleh administrator", actor.id, true);
      }

      if (input.stage) {

        if (input.stage.reviewedVersion !== parsed.version) throw new HttpError("File atau pemetaan kolom berubah. Validasi kembali.", 409);

        await stageMapping(parsed, file, input.filename, input.stage.source, actor.id);

      }

      const { rows: _rows, ...preview } = parsed;

      return result(preview);

    } finally { processingUpload = false; }

  });

}



export async function PUT(req: Request) {

  return handle(async () => {

    assertSameOrigin(req);

    const actor = await admin();

    const input = z.object({ version, confirm: z.literal(true) }).strict().parse(await readJntJson(req, 1024));

    await activateMapping(input.version, actor.id);

    return result({ activeVersion: input.version });

  });

}
