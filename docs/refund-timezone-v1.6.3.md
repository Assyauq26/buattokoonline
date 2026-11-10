# Customer refund time rendering v1.6.3

Production visual verification of v1.6.2 found React hydration error 418 on refunds with a recorded transfer. The transfer timestamp used the host's default timezone: the production server and customer browser rendered different text. Financial state and stored timestamps were unaffected.

Render that timestamp explicitly in Asia/Jakarta and label it WIB, matching the refund history. The same regression check exposed default-timezone rendering in the seller refund view; its transfer and history times now use WIB as well. Browser verification uses America/Los_Angeles while the local server uses Asia/Jakarta, covering the cross-timezone condition. No database, payment, stock, shipment, credential or dependency changes.

This is a follow-up patch under the owner's release/deployment authorization. Preserve v1.6.2 artifacts and tag; release a new immutable v1.6.3 package rather than replacing an already published release.
