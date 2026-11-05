import "server-only";
import { putLocalObject, getLocalObject, removeLocalObject } from "./storage-local";
export const STORAGE_APP = "store";
export async function putObject(path: string, data: Uint8Array, contentType: string, signal?: AbortSignal) {
  return putLocalObject(path, STORAGE_APP, data, contentType, signal);
}
export async function getObject(path: string, signal?: AbortSignal) {
  return getLocalObject(path, STORAGE_APP, signal);
}
export async function removeObject(path: string, signal?: AbortSignal) {
  return removeLocalObject(path, STORAGE_APP, signal);
}
