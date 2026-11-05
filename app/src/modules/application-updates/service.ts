import "server-only";
import { HttpError } from "@/lib/response";
import { version as installedVersion } from "../../../package.json";

const repository = "Assyauq26/buattokoonline";
const repositoryId = 1446326256;
const api = `https://api.github.com/repos/${repository}`;
const cooldown = 30_000;
export type Release = { version: string; publishedAt: string; notes: string; url: string; sha: string; assetDigest: string };
export type UpdateStatus = {
  installedVersion: string; release: Release | null; checkedAt: string | null;
  status: "not_checked" | "no_release" | "current" | "available" | "ahead";
  execution: "cli"; compatibility: "pending_cli"; checking: boolean; nextCheckAt: string | null;
};
let snapshot: Omit<UpdateStatus, "checking" | "nextCheckAt"> = {
  installedVersion, release: null, checkedAt: null, status: "not_checked", execution: "cli", compatibility: "pending_cli",
};
let checking = false;
let lastAttempt = 0;

export function readUpdateStatus(): UpdateStatus {
  return { ...snapshot, checking, nextCheckAt: lastAttempt ? new Date(lastAttempt + cooldown).toISOString() : null };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError("Metadata rilis GitHub tidak valid", 502);
  return value as Record<string, unknown>;
}
export function stableVersion(value: unknown): number[] {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(value)) throw new HttpError("Versi rilis stabil tidak valid", 502);
  return value.split(".").map(Number);
}
export function compareVersions(left: string, right: string) {
  const a = stableVersion(left), b = stableVersion(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}

async function github(path: string, missing = false): Promise<unknown> {
  const response = await fetch(api + path, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "single-store-release-reader" },
  });
  if (missing && response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw new HttpError("GitHub belum dapat diperiksa. Tunggu sebentar lalu coba lagi, atau gunakan CLI.", 502); }
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError("Metadata rilis kosong", 502);
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 1024 * 1024) { await reader.cancel(); throw new HttpError("Metadata rilis terlalu besar", 502); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError("Metadata GitHub tidak dapat dibaca", 502); }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (checking) throw new HttpError("Pemeriksaan pembaruan masih berjalan", 409);
  if (lastAttempt && Date.now() - lastAttempt < cooldown) throw new HttpError("Tunggu 30 detik sebelum memeriksa kembali", 429);
  checking = true; lastAttempt = Date.now();
  try {
    const identity = record(await github(""));
    if (identity.id !== repositoryId || typeof identity.full_name !== "string" || identity.full_name.toLowerCase() !== repository.toLowerCase()) throw new HttpError("Identitas repository rilis tidak cocok", 502);
    const raw = await github("/releases/latest", true);
    let release: Release | null = null;
    if (raw !== null) {
      const data = record(raw);
      if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== "string" || !data.tag_name.startsWith("v")) throw new HttpError("Hanya rilis stabil resmi yang diterima", 502);
      const version = data.tag_name.slice(1); stableVersion(version);
      const url = `https://github.com/${repository}/releases/tag/v${version}`;
      if (data.html_url !== url || typeof data.published_at !== "string" || !Number.isFinite(Date.parse(data.published_at))) throw new HttpError("Identitas atau tanggal rilis tidak valid", 502);
      let ref = record(record(await github(`/git/ref/tags/v${version}`)).object);
      for (let i = 0; i < 5 && ref.type === "tag"; i++) {
        if (typeof ref.sha !== "string" || !/^[a-f0-9]{40}$/.test(ref.sha)) throw new HttpError("Tag rilis tidak valid", 502);
        ref = record(record(await github(`/git/tags/${ref.sha}`)).object);
      }
      if (ref.type !== "commit" || typeof ref.sha !== "string" || !/^[a-f0-9]{40}$/.test(ref.sha)) throw new HttpError("Commit rilis tidak dapat diverifikasi", 502);
      const name = `store-v${version}.tar.gz`;
      const assets = Array.isArray(data.assets) ? data.assets.map(record).filter(asset => asset.name === name) : [];
      const asset = assets[0];
      if (assets.length !== 1 || typeof asset.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || asset.browser_download_url !== `https://github.com/${repository}/releases/download/v${version}/${name}` || typeof asset.size !== "number" || asset.size <= 0 || asset.size > 300 * 1024 * 1024) throw new HttpError("Paket rilis resmi atau digest GitHub belum valid", 502);
      release = { version, publishedAt: data.published_at, url, sha: ref.sha, assetDigest: asset.digest,
        notes: typeof data.body === "string" ? data.body.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, 20_000) : "Tidak ada catatan rilis." };
    }
    const comparison = release ? compareVersions(release.version, installedVersion) : 0;
    snapshot = { ...snapshot, release, checkedAt: new Date().toISOString(), status: !release ? "no_release" : comparison > 0 ? "available" : comparison < 0 ? "ahead" : "current" };
    return { ...readUpdateStatus(), checking: false };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("Pemeriksaan GitHub terputus. Coba lagi setelah 30 detik; toko tetap berjalan.", 502);
  } finally { checking = false; }
}
