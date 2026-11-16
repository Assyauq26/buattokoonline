// Position is measured in product intervals. The back of a small ring is
// invisible where a product's signed distance changes sign at the seam.
export function offsetFrom(position: number, center: number, total: number) {
  const raw = position - center;
  return total < 3 ? raw : raw - total * Math.floor(raw / total + 0.5);
}
export const wrap = (value: number, total: number) =>
  ((value % total) + total) % total;
// A point on the front of a vertical elliptical cylinder. The camera supplies
// apparent scale. Keep the card baseline level and turn its face toward center.
export const anglePerProduct = (mobile: boolean) => (mobile ? 0.59 : 0.34);
export function orbitPose(offset: number, total: number, mobile: boolean) {
  const theta = Math.max(
    -Math.PI / 2,
    Math.min(
      Math.PI / 2,
      offset * anglePerProduct(mobile) + (mobile ? 0 : 0.036 * offset ** 3),
    ),
  );
  const x = Math.sin(theta),
    depth = Math.cos(theta) - 1;
  const limit = Math.min(mobile ? 2.03 : 2.42, total >= 3 ? total / 2 : 3);
  const opacity = Math.max(
    0,
    Math.min(1, (limit - Math.abs(offset)) / Math.min(0.42, limit - 1)),
  );
  return { x, depth, yaw: -x * (mobile ? 28 : 31), opacity };
}
export function orbitStyle(offset: number, total: number, mobile: boolean) {
  const { x, depth, yaw, opacity } = orbitPose(offset, total, mobile);
  return {
    transform: `translate(-50%, -50%) translate3d(calc(var(--orbit-rx) * ${x}), 0px, calc(var(--orbit-rz) * ${depth})) rotateY(${yaw}deg)`,
    opacity,
    zIndex: 10 + Math.round(100 * (1 + depth)),
  };
}
