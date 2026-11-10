# Shipping review v1.6.1

The seller creates an AWB from a single responsive review sheet: recipient, editable package weight, and an initially collapsed item summary. The edit action updates the order recipient/contact/address details only; the original district, city and province remain fixed. It does not alter the customer address book.

Changed details require a fresh J&T rate check for the original checkout service and mapping. A changed rate requires explicit seller acceptance; the buyer total and charged shipping remain unchanged. Saving checks authorization, the order lock, paid state, active refunds, and a fingerprint of the reviewed address/service/weight. Any existing shipment or creation attempt prevents editing its immutable payload. Creating the AWB rejects a stale review and preserves existing idempotency/uncertain-result reconciliation.

The list retains all status tabs with scrolling and keyboard focus, hides only the tab scrollbar, and uses 6px status badges. Seller detail keeps the existing timeline under “Status Pesanan” and removes only its Help accordion. Successful AWB creation remains waiting for pickup until carrier tracking confirms acceptance. No pickup integration, stock, payment, refund, or cancellation rules change.

No database migration or dependency change. Verified locally with typecheck, production build, 668 passing tests (3 skipped), and a 45-scenario browser run including mobile 360/390/430 and desktop. Carrier dispatches are mocked; live checks must remain read-only.

Hubify baseline: v1.6.0 / 1935a3ea02146ceb8cd6e36eb5eae68610a248e2. Deploy only the application after a verified backup and unchanged migration ledger. Keep the existing runtime environment and shared reverse proxy. Rollback restores the previous compatible application image and preserves the current database; never restore an earlier financial ledger automatically.
