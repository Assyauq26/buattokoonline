/**
 * Node-only filesystem checks. Never import this module from browser bundles.
 * Store configuration parsing stays pure/universal in config.ts.
 */
import { lstatSync } from "node:fs";
import path from "node:path";

const SYSTEM_ROOTS = ["/etc", "/root", "/proc", "/sys", "/dev", "/run", "/boot", "/usr", "/bin", "/sbin"];

/** Fail closed if the durable media mount is absent, not a directory or symlinked. */
export function assertExistingLocalStorageRoot(root: string): void {
  if (
    !root.startsWith("/") || root === "/" || root.endsWith("/") ||
    root.includes("\\") || root.includes("//") ||
    root.split("/").some(part => part === "." || part === "..") ||
    SYSTEM_ROOTS.some(prefix => root === prefix || root.startsWith(prefix + "/"))
  ) throw new Error("Invalid STORAGE_LOCAL_ROOT");
  let current = "/";
  for (const segment of root.split("/").filter(Boolean)) {
    current = path.posix.join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("Invalid directory");
      }
    } catch {
      // Never include filesystem paths or OS error details in application logs.
      throw new Error("Invalid STORAGE_LOCAL_ROOT");
    }
  }
}
