export const OPERATION_NOTICE_KEY = "store:operation-saved";
/** Refresh committed server state with a document navigation, including streamed boundaries. */
export function reloadOperationPage(saved = false) {
  if (saved) { try { sessionStorage.setItem(OPERATION_NOTICE_KEY, JSON.stringify({ path: location.pathname, at: Date.now() })); } catch { /* Navigation still works with browser storage disabled. */ } }
  window.location.reload();
}
