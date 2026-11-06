# Hubify order fulfillment

Manual transfer proof is approved/rejected through the existing payment service. Approved payment opens `PAID → PROCESSING → PACKED`. J&T creation is available only for eligible paid, packed orders and retains the existing durable request/idempotency controls.

Creating or printing an AWB does not mark a parcel shipped. Operator handover or official tracking advances shipping. Latest dated J&T code 100 means in transit; 200 means delivered. Delivery appears in the Selesai tab without changing payment balances. Active refunds hold automatic order transitions. Failed tracking preserves the last status.

The existing local maintenance timer invokes authenticated `/api/internal/cron/jnt-tracking`. Each run processes one oldest due shipment, at most once per 24 hours per shipment. The one-minute timer supports up to 1,440 due shipments daily; larger stores need a larger bounded batch or dedicated worker. Manual refresh is available on order details. Tracking events are deduplicated under the order lock.

`/admin/orders/[id]/awb` requires shipping-read permission and a confirmed matching J&T AWB. It generates Code 128 and QR locally, uses historical warehouse/mapping configuration, and prints on 100 × 150 mm paper. Transfer orders are NON COD. No carrier route code or estimated delivery date is fabricated. Verify printed barcode readability with the carrier before operational rollout.

No database migration is required. Deployment is limited to the Hubify development candidate; template release remains separate.
