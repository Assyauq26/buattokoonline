# Hubify product deletion and seller UI review

## Behavior and transaction integrity

Deleting a product removes it from seller catalog, inventory, dashboard counts, public sale, cart, wishlist and recently viewed. Editing, publishing, inventory adjustment and campaign assignment reject its internal record. The original public slug becomes available again. Authorization, optimistic revision, serializable transaction, retry and audit are retained. Active order records, payment and shipment details, original item names/prices/quantities and variant identities remain intact; order-item image snapshots become null. Images and option references are detached transactionally, and only unshared owned objects enter the existing post-commit cleanup process.

The internal Product and ProductVariant records remain as tombstones because cancellations and inspected returns still use variant IDs and inventory movements. Their SKU values remain reserved for history; a new product cannot reuse an old deleted SKU. This is a catalog deletion, not physical erasure of transaction records. In a code rollback, the older UI can show a tombstone as archived; it remains unavailable for sale and order data remains intact.

No schema, historical migration, release artifact or ledger changes are required. Tombstones use the reserved `_deleted_` slug prefix, which the existing product slug validator rejects. Postgres LIKE treats `_` as a wildcard, so Prisma filters explicitly escape the underscores; integration tests cover similarly named valid products. The Hubify preflight must reject any pre-existing reserved-prefix slug before deployment.

Deleting an image clears references in the product draft and, on save, clears matching snapshots only for orders of that product. Transaction details are unchanged. Shared external URLs remain untouched. An internal URL shared by another product or its orders fails closed before any mutation because removing its image ID would break that product; the shared reference must first be resolved. Cancelled draft changes restore the previous state.

## UI review (emil-design-eng)

| Before | After | Why |
| --- | --- | --- |
| Sidebar scrollbar is visible | Scroll remains usable with the indicator hidden | Cleaner navigation |
| Product actions in a small popover | Product summary and accessible action sheet on mobile, dialog on desktop | Matches supplied design and gives each action space |
| Character-based order disclosure | Chevron made from consistent strokes | Clearer expand/collapse indication |
| Coloured variation action buttons | Neutral black controls with visible focus | Consistent seller interface |
| Customer footer/WhatsApp entry expose admin links | Links removed from customer surfaces | Simplifies customer navigation |
| Admin button text inherits dark storefront link colour | White text on black, including focus and hover | Readable contrast |

## Deployment boundary

The compatibility module authorizes only the exact installed source f7da54d24e92241326ea58472d4d2012bfe791d0 paired with complete app tree 476df370f9fc9595d00040b3309ee51f883148cb, alongside all existing version, installation, archive, historical bytes and complete ledger checks. The pair does not authorize other candidates or installations. The normal exact-main workflow, GitHub Environment, lock, backup, proxy pins, health checks and recovery remain in effect. Historical SQL and ledger must not be edited or bypassed.
