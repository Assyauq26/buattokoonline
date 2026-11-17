// Position is measured in product intervals. The back of a small ring is
// invisible where a product's signed distance changes sign at the seam.
export function offsetFrom(position: number, center: number, total: number) {
  const raw = position - center;
  return total < 3 ? raw : raw - total * Math.floor(raw / total + 0.5);
}
export const wrap = (value: number, total: number) =>
  ((value % total) + total) % total;
// The horizontal arc describes projected positions in the carousel window.
// Compensate for perspective on X so depth narrows the faces without closing
// the gap between products. CSS uses a depth radius of 0.6 × perspective.
export const anglePerProduct = (mobile: boolean) => (mobile ? 0.46 : 0.44);
export function orbitPose(offset: number, total: number, mobile: boolean) {
  const distance = Math.abs(offset);
  const arc = Math.min(Math.PI / 2, distance * anglePerProduct(mobile));
  const turn = Math.min(Math.PI / 2, distance * 0.68);
  const depth = Math.cos(turn) - 1;
  const x = Math.sign(offset) * Math.sin(arc) * (1 - 0.6 * depth);
  const yaw = Math.sign(offset) * Math.sin(turn) * (mobile ? 26 : 23);
  const limit = total >= 3 ? Math.min(total / 2, 2.6) : 3;
  const opacity = Math.max(0, Math.min(1, (limit - distance) / 0.4));
  return { x, depth, yaw, opacity };
}
export function orbitStyle(offset: number, total: number, mobile: boolean) {
  const { x, depth, yaw, opacity } = orbitPose(offset, total, mobile);
  return {
    transform: `translate(-50%, -50%) translate3d(calc(var(--orbit-rx) * ${x}), calc(var(--orbit-drop) * ${-depth}), calc(var(--orbit-rz) * ${depth})) rotateY(${yaw}deg)`,
    opacity,
    zIndex: 10 + Math.round(100 * (1 + depth)),
  };
}
