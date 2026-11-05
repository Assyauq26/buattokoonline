import type { MovementType } from "@prisma/client";
/** Display ledger semantics without changing its stored quantity or business effects. */
export function movementLabel(type: MovementType, quantity: number) {
  const signed = (n: number) => n < 0 ? `−${Math.abs(n)}` : `+${n}`;
  switch (type) {
    case "ADJUSTMENT": return `Fisik ${signed(quantity)}`;
    case "RETURN": return `Fisik ${signed(quantity)}`;
    case "RESERVATION": return `Reservasi ${signed(quantity)}`;
    case "RELEASE": return `Reservasi ${signed(-quantity)}`;
    case "SALE": return `Fisik ${signed(-quantity)} · reservasi ${signed(-quantity)}`;
    default: return `${quantity} unit (${type})`;
  }
}
