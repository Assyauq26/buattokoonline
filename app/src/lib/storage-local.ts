import { constants } from "node:fs";
import { mkdir, realpath, lstat, open, unlink } from "node:fs/promises";
import path from "node:path";
import { resolveStorageObject } from "./storage-path";
import { assertExistingLocalStorageRoot } from "./self-hosted/storage-root";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

async function location(reference: string, app: string, create: boolean) {
  const object = resolveStorageObject(reference, app);
  const configured = process.env.STORAGE_LOCAL_ROOT;
  if (!configured || !path.isAbsolute(configured)) throw new Error("Local storage root must be absolute");
  assertExistingLocalStorageRoot(configured);
  const root = await realpath(configured);
  const segments = object.key.split("/");
  const name = segments.pop()!;
  let directory = root;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    if (create) await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid local storage directory");
  }
  return { file: path.join(directory, name), contentType: MIME[object.extension] };
}

export async function putLocalObject(reference: string, app: string, data: Uint8Array, contentType: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const target = await location(reference, app, true);
  if (contentType !== target.contentType || !data.length || data.length > 4 * 1024 * 1024) throw new Error("Invalid storage upload");
  const handle = await open(target.file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(data);
    signal?.throwIfAborted();
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(target.file).catch(() => {});
    throw error;
  }
  await handle.close();
  return { path: reference, size: data.length };
}

export async function getLocalObject(reference: string, app: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const target = await location(reference, app, false);
  const handle = await open(target.file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error("Invalid stored object");
    const data = await handle.readFile();
    signal?.throwIfAborted();
    return { data: new Uint8Array(data), contentType: target.contentType };
  } finally { await handle.close(); }
}

export async function removeLocalObject(reference: string, app: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  try {
    const target = await location(reference, app, false);
    const stat = await lstat(target.file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid stored object");
    await unlink(target.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
