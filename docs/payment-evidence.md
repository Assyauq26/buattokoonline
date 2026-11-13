# Payment evidence methods — draft, defaults OFF

## Scope and audit (2026-11-13)

Base: seller `main` e885ca4. No production deployment, merchant login, bank changes,
real money or central-platform changes are authorized by this task.

Existing checkout creates manual bank-transfer Payment records and reserves stock
in the same transaction. Payment approval locks Order → Payment → sorted Inventory,
commits stock, writes order/payment status, history, audit and notification atomically.
Submitted proofs before expiry remain reviewable. Cancellation/expiry release stock;
evidence must never revive those orders. Bank edits create new immutable account
versions. New source configurations must bind an explicit account version, not
follow the newest account automatically. Midtrans/Tripay are prepared adapters,
not enabled checkout integrations. Existing outbound email/OTP is not Gmail access.

Reference: https://github.com/ahmadzakiyox/gopay-api-gateaway at
c753b8c23daf5ced58febe650bcd229b6b2b7dec (MIT, Ahmad Zaki, 2026).
No upstream code is vendored or executed. The readable server stores QR/claims in
process Maps, removes claims after 24 hours, defaults an absent mutation status to
success, requests the first transaction page, includes refunds, and makes provider
requests from status checks. Static QR conversion does not first verify input CRC.
login.js/sessionManager.js are obfuscated (~425/464 KB), so authentication/refresh
has NOT been established as an auditable or stable production protocol. We do not
copy that login flow or ask sellers to provide passwords/cookies.

## Design before implementation

1. Add independent durable source/attempt/evidence/claim/review records. No changes
   to existing order prices or transaction history. Use scoped source identity,
   integer IDR amounts, source-level locks, collision retention beyond expiry,
   permanent claims, lease fencing and explicit review reasons.
2. Implement strict local QRIS TLV/CRC conversion, authenticated encryption with
   tenant/source/purpose AAD, conservative provider normalization and a synthetic
   bank parser. No bank is production-supported without validated real samples.
3. Prepare per-installation official Gmail OAuth, single-use state bound to staff,
   PKCE, encrypted tokens, explicit disconnection, limited read scope and bounded
   paginated reads. Do not use the central outbound relay or request Gmail passwords.
4. Seller settings and review screens follow existing monochrome dashboard styles.
   Explain blocked activation instead of displaying a nonfunctional Active switch.
   No checkout option is offered while either live connector remains unvalidated.
5. Test safety invariants using synthetic fixtures and isolated local DB only;
   document missing real-account checks separately. Draft PR only, no version/tag.

## Financial policy

Amount + time (even a unique amount) is not identity or proof of an order link.
All connector observations require seller review; there is NO automatic paid path.
Unknown/refund/partial/non-credit/non-IDR/untrusted mailbox observations are held
with reasons. A durable source transaction ID is required for a permanent claim.
Duplicate messages cannot be used as new money. A seller must independently check
their merchant/bank record and supply a reason. Expired/cancelled/refunded orders
cannot be settled; handle late money through a separate operator refund process.

## Google deployment architecture and gates

Each seller VPS needs an operator-owned Google Cloud OAuth web client, enabled
Gmail API, exact HTTPS callback origin and securely provisioned client secret and
PAYMENT_INTEGRATION_ENCRYPTION_KEY (32 random bytes, base64). This draft does not
change the platform relay. Scope gmail.readonly reads mailbox contents broadly;
label/query filtering is NOT a narrower authorization boundary. Prefer a dedicated
notification mailbox. Public distribution needs applicable restricted-scope
verification/security assessment or a documented exception; not completed here.
External Testing refresh tokens with Gmail scope expire after seven days.

References checked 2026-11-13:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list

## Migration / backup / updater / recovery

Additive migration only; preserve all 31 historical migrations byte-for-byte.
Do not run on production as part of this draft. Backup DB and encrypted configuration
including the encryption key together; test restore to an isolated DB. Losing the
key requires reconnect, never replacement ciphertext or ledger manipulation.
The existing updater's migration compatibility allowlist is not permission to
ship arbitrary payment SQL. A separately reviewed release/upgrade compatibility
plan is required; do not change rollbackCompatible just to pass a guard.

With features OFF, legacy code can ignore new tables. After activation, pause source
polling and reconcile leases before rolling code back. Do not delete claims, code
retention or observations during rollback. Never restore an old DB over new orders.
Revoke/disconnect credentials if compromised; preserve financial metadata/audits.
An interrupted ingest retries by stable source identity, not by assuming new money.

## Operational release gates (open)

- GoPay: auditable authorized login/refresh contract, real merchant status/ID and
  pagination fixtures, terms/risk acceptance, limited authorized transaction tests.
- Bank: named bank, redacted original notification samples including trusted
  delivery/authentication provenance, stable transaction identity and account match.
  From and arbitrary Authentication-Results headers are never trusted alone.
- Google: actual client/registered redirect, OAuth revoke/refresh/reconnect smoke,
  verification/exception and data retention policy.
- Checkout activation: explicit payable/unique-code accounting and refund policy,
  stock/order integration and live operational tests before exposure to buyers.
- Worker scheduling and updater quiescence must be reviewed before deployment.

## Implemented boundary and remaining work

This is a reviewable foundation, NOT two operational payment gateways. Existing
manual checkout, proof approval, stock settlement and webhook behavior are unchanged.
The new association endpoint deliberately never updates Payment/Order to PAID,
commits inventory, sends paid notifications or manufactures a transfer proof.
No checkout selector, live GoPay login, live bank parser, mailbox body ingestion,
automatic settlement, installed timer or scheduler activation is shipped here.
Only the scoped paginated polling primitive/lease persistence and Gmail message-list
transport exist; linking a real mailbox to bank events remains blocked on samples.

New customer QR/countdown/unique-code instruction UI and accounting/refund wiring
remain blocked behind the live-method gates. Buyers continue to see manual transfer;
we do not show a QR that could solicit money for an unready integration. The new
allocation callback can create a new payable order atomically for future checkout
integration, and never reprices an existing manual order.

The source is disabled by default in application code AND an explicit database
CHECK constraint (`enabled = FALSE`). A future activation requires separately
reviewed code/migration; environment variables cannot silently enable checkout.
Bank sources bind an immutable BankAccount ID and conservatively fingerprint IDR
account digits across bank-label/version edits. Identical digits at different banks
are intentionally blocked too until validated canonical bank identities exist.
Do not weaken this deduplication by editing source IDs or historical claims.

### Local operator preview only

After applying the reviewed migration to an isolated environment:

1. Keep `PAYMENT_PROVIDER=manual`. Provision a stable `STORE_INSTALLATION_ID`.
2. Set `PAYMENT_EVIDENCE_PREVIEW=true` to view draft forms and scoped evidence.
3. Provision `PAYMENT_INTEGRATION_ENCRYPTION_KEY`: 32 cryptographically random bytes
   encoded as base64. Store it in the protected installation configuration, not Git,
   the browser, logs, a seller form, or a chat. Back it up with the encrypted DB.
4. For authorized OAuth tests only, configure `PAYMENT_GOOGLE_CLIENT_ID`,
   `PAYMENT_GOOGLE_CLIENT_SECRET` and `PAYMENT_GMAIL_OAUTH_TEST=true`. Register
   `https://<exact-shop-origin>/api/v1/admin/payment-evidence/oauth/callback`.
   `APP_ORIGIN` must be that trusted HTTPS origin. There is no arbitrary redirect.
5. Settings → Payment Methods → Gmail: choose the receiving account version,
   save a draft, then explicitly consent to Google read access. State is one-use,
   ten minutes, bound to staff, current browser session, source and generation.
   Callback never echoes codes/tokens/errors; configure proxy log redaction for
   OAuth query parameters before real tests. Success says parser remains blocked.
6. Disconnect removes local tokens, fences old workers and invalidates consent
   state. A failed remote revoke is reported explicitly and audited; remove the
   app from Google Account Security before assuming remote authorization ended.
7. Do not install a polling timer or expose the method at checkout from this draft.

Review page: Payment Methods → Transactions requiring review. A stable settled
credit can only be associated manually after staff permission and transaction
checks. Seller must provide an independent-verification reason; a claim is permanent
and is labelled **not paid**. Untrusted/changed/refund/late/under/over/closed-order
evidence cannot be force-associated. Paid approval remains the legacy proof flow.

### UI review (Emil design engineering)

| Before | After | Why |
| --- | --- | --- |
| Only manual bank configuration | Separate readiness cards and detailed setup pages | Seller sees availability and limitations before entering data |
| No source-evidence state | Scoped review list and detail with human-readable reasons | Detected money cannot be confused with a paid order |
| No independent connector controls | Disabled activation, explicit OAuth consent/disconnect and pending feedback | Avoid accidental activation and duplicate actions |

All primary actions use black/white styling; labelled fields, focus outlines,
44px minimum actions and live status feedback support keyboard/mobile operation.
No decorative page animations; pending spinner respects reduced motion.

## Verification evidence

All checks use synthetic data, mock provider responses, or local PostgreSQL 16.
No merchant/bank/OAuth account was contacted or configured. No production VM,
central platform, release tag, catalog, installed updater or live store was changed.

The 31 original migration files plus migration_lock.toml match Git blob hashes
(32 files, zero mismatches). The 31→32 rehearsal seeds pending/paid orders, immutable
line price/name snapshots, payment/account references, reserved SKU stock, voucher
and order history before upgrade. Final snapshot SHA-256 before/after:
`50d6493f32f03d7b4d845e28d193fce4faead7339ee6fc2bffa38adbb27ac17d`.

The rehearsal script `app/scripts/payment-evidence-rehearsal.ts` refuses remote,
non-PostgreSQL or non-lab database names/ports. A failed initial fixture seed was
preserved separately; the script now seeds in a transaction. Final upgrade uses
a fresh 31-migration lab database, not an edited Prisma ledger. The new unpublished
migration was refined before review; no historical migration was altered.

`installer.updater.validate_additive` rejects the final payment SQL as expected:
its intentionally restricted grammar cannot authorize the constraints/foreign keys.
No helper, compatibility declaration or baseline metadata was changed to bypass it.
Foreign-key creation references Payment/BankAccount; although new child tables are
empty, DDL can briefly block concurrent parent writes. A future operator migration
must assess locks/load and enforce bounded lock/statement timeouts before mutation.

Final targeted checks: 58 tests passed (49 unit/regression + 9 database tests),
scoped ESLint passed, TypeScript/production build passed. These cover actual local
row locking and concurrent transactions, permanent duplicate claims, fresh-client
persistence, late/partial/excess/refund/unknown/closed-order rejection, source
generation fencing, token encryption and mocked OAuth callback/revoke behavior.
A callback that finishes after disconnect discards/revokes its newly issued token;
a failed revoke is audited for manual action, and parallel local connections are
marked for reconnect because Google revocation can affect a shared app/account grant.
The polling deadline also rejects a transport that ignores cancellation. No actual
OS reboot, installed scheduler, GoPay session refresh, bank email delivery or Google
consent/verification was tested; those remain open gates.

Final PostgreSQL 16.13 pg_dump/pg_restore succeeded into a separate local restore DB
with 32 completed/non-rolled-back ledger entries and the same baseline snapshot.
Lab dump SHA-256:
`c3fe9b6dc0f83da56be7cf9362780467518df7a7536505ffb51586c71f3fd2e0`.
Final new migration SHA-256 (LF bytes, matching lab ledger):
`e674bd330da1bd6ff0f682caf1326541a058bcb73b2ee58e99635687d4a27286`.
The dump is local synthetic evidence outside Git, not a production recovery backup.

The CI profile now reserves a separately guarded payment-evidence test database on
the existing disposable PostgreSQL service; no new staging service or production
configuration is introduced. CI was not dispatched. Source-boundary and Git
whitespace checks also passed; original checkout/settlement/order/inventory code
and all published version/tag metadata remain unchanged.

Authenticated browser fixture smoke: 16 checks passed on the final production
build at 390×844 and 1440×1000, zero browser runtime errors and no horizontal
overflow. Covered method/setup/list/detail pages, invalid QR validation, unavailable
OAuth controls, untrusted evidence with no association/paid action, anonymous and
cross-origin rejection, and rejection of a client-supplied activation field.
Sessions were signed local fixtures, not real seller login or Google login tests.
Reproduce with `DATABASE_URL=postgresql://...@127.0.0.1:5568/hubify_payment_evidence_test`
and `node tests/payment-evidence-browser.mjs` after building with Node 22.
Screenshots/results are local test artifacts under `audit-tools/payment-evidence-browser-final`
outside this Git worktree; synthetic data is not included in installer/runtime UI.

## Status and remaining operator inputs

### First bank selected: blu by BCA Digital

The owner selected blu and supplied a cropped Gmail screenshot on 2026-11-13.
It shows an incoming bluAccount notification, Indonesian IDR formatting, recipient
account, WIB date/time and BI-FAST type. It does NOT show a stable bank transaction
ID, complete email, sender address or trusted delivery/authentication provenance.
No personal name, account number, amount or timestamp from the screenshot is copied
into repository fixtures. `blu-preview.ts` recognizes synthetic screenshot-shaped
plain text only, returns UNKNOWN/untrusted/no bankTxId, and is deliberately not
connected to ingestion or checkout. It cannot establish that funds arrived.

blu is the first validation target; other banks remain undecided. A full original
notification's MIME/text/HTML structure and redacted headers are needed for parser
development. Sender authenticity must later be checked on original messages via
the authorized mailbox, not inferred from edited headers or the displayed name.
The production-supported bank list remains empty; no new source is activated.
Incremental validation: 14 new blu-preview cases plus 36 existing payment-evidence
unit cases passed (50 targeted tests); TypeScript and scoped ESLint passed. This
does not replace the missing original-email, trusted-delivery or live-bank tests.

| Feature | Status | Required before pilot |
| --- | --- | --- |
| Durable evidence/claims, local QR and preview seller UI | SIAP REVIEW | Review SQL, permissions, financial policy and operating procedures |
| Official Gmail OAuth code | SIAP REVIEW; live BLOCKED | Real client/redirect, authorized consent/refresh/revoke test and verification/exception |
| GoPay login/refresh and live mutations | BLOCKED | Auditable authorized protocol, merchant fixtures and limited real tests |
| Bank notification interpretation | BLOCKED; blu preview/synthetic fixture only | Complete blu notification and validated delivery/authentication provenance |
| New checkout methods and scheduler | BLOCKED | Validated source, accounting/refund policy, end-to-end stock/order checks and updater migration/quiescence support |

No feature is labelled SIAP PILOT or ready for production. Do not reuse the same
receiving merchant/bank account across independently installed stores for automatic
matching: this draft has no cross-VPS global transaction-claim registry. Amount/time
association is insufficient even when each local claim is unique.

Needed from the owner: complete redacted authentic blu notifications (other banks
can follow later),
Google project/verification decision, an auditable authorized GoPay access contract
and test account availability, and the business policy for unique-code collection
and late/refund accounting. Do not provide passwords/OTP/private tokens in chat.
