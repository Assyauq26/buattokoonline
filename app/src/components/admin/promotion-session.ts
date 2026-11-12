/** Recovery for browser Back/Forward and reload, scoped to the authenticated
 * seller. This is never presented as a server-saved draft. */
export function readPromotionSession<T>(
  key: string,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 1000000) return null;
    const value: unknown = JSON.parse(raw);
    return validate(value) ? value : null;
  } catch {
    return null;
  }
}
export function writePromotionSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Server Save draft remains available when browser storage is unavailable. */
  }
}
export function clearPromotionSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
