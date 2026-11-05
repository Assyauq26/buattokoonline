export const CART_COUNT_EVENT = "store:cart-count";

export function emitCartCount(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_COUNT_EVENT, { detail: count }));
}

export function emitCartCountDelta(delta: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_COUNT_EVENT, { detail: { delta } }));
}
