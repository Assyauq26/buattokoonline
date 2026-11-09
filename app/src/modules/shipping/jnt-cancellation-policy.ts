/** A seller handover statement is not authenticated carrier pickup. */
export function hasCarrierMovement(
  shipment?: {
    status?: string | null;
    carrierCondition?: string | null;
  } | null,
) {
  return (
    !!shipment &&
    (["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(shipment.status || "") ||
      ["RETURNING", "RETURNED"].includes(shipment.carrierCondition || ""))
  );
}

export function canRequestJntCancellation(input: {
  orderStatus: string;
  requestState?: string | null;
  shipmentStatus?: string | null;
  carrierCondition?: string | null;
}) {
  return (
    ["PROCESSING", "PACKED", "CANCELLED", "REFUNDED"].includes(
      input.orderStatus,
    ) &&
    input.requestState === "SUCCEEDED" &&
    input.shipmentStatus === "PENDING" &&
    !hasCarrierMovement({
      status: input.shipmentStatus,
      carrierCondition: input.carrierCondition,
    })
  );
}

export function shipmentHasLeftWarehouse(input: {
  orderStatus: string;
  requestState?: string | null;
  shipment?: {
    provider?: string;
    status?: string | null;
    carrierCondition?: string | null;
    cancelledAt?: unknown;
    sellerHandoverAt?: unknown;
    shippedDate?: unknown;
    events?: { status: string }[];
  } | null;
}) {
  const s = input.shipment;
  if (
    s?.provider === "jnt" &&
    s.cancelledAt &&
    input.requestState === "CANCELLED" &&
    !hasCarrierMovement(s) &&
    !s.shippedDate &&
    !s.events?.some((e) => hasCarrierMovement(e)) &&
    !["SHIPPED", "DELIVERED", "COMPLETED"].includes(input.orderStatus)
  )
    return false;
  return (
    !!s?.sellerHandoverAt ||
    !!s?.shippedDate ||
    hasCarrierMovement(s) ||
    ["SHIPPED", "DELIVERED", "COMPLETED"].includes(input.orderStatus)
  );
}
