# Payments live completion — release candidate review

Base: main ef7b338413b33d05e864deb858ccc75a5269189a, published v1.8.2.
Hubify was freshly checked at that source/version, schema33 and healthy services.
Deployment state must be read from the final root journal and smoke receipt. This review records source validation, not proof of deployment.
The owner authorizes implementation, merge, Hubify deployment and publication
after gates, without another approval or bank transfer before release.

## Implemented continuation

blu now claims one authenticated bank credit and settles through the shared
payment/inventory/history/notification transaction. Exact final amount, receiving
account, signed supported incoming-email content, an active matching window and
one unclaimed notification are required. Sender identity is not a match key.
Conflicts, invalid signatures, unsupported message identity and closed orders
remain unapproved. Claims never expire or disappear on restart.

Activation readiness uses the exact backend activation validator without writes.
Live HTML currently had an enabled checkbox/button; the prior backend combined
message hid the five-minute Gmail-check freshness requirement. Separate reasons
now distinguish stale checks, disconnected/invalid sessions, inactive accounts,
missing bank signature verification and operator permission/configuration.

| Before | After | Why |
| --- | --- | --- |
| Activation error appears only after submitting | Readiness reason shown before activation | Explain the actual unmet requirement |
| Every blu candidate requires approval | One authenticated, unique incoming notification settles atomically | Apply the owner's amount-based business rule |
| Browser only reads stored status | Explicit check uses the shared backend worker with durable cooldown | Tabs cannot manufacture payment proof or multiply provider polls |
| QRIS text only | Bounded PNG/JPEG/WebP upload, local decode and TLV/CRC validation | Support phone and desktop setup |
| Opaque authentication dependency | In-repository typed fixed-origin transport and encrypted persistent sessions | No opaque program runs with merchant credentials |
| QR image follows mutable settings | QR payload, random QR/trx IDs and merchant name snapshot per attempt | Configuration edits cannot change issued bills |

## GoPay contract evidence

Upstream reference: ahmadzakiyox/gopay-api-gateaway at c753b8c; readable historic
server2f9444e79c17c2fd01832a03720a7b67032bab9f was compared with current server.
Current login.js/sessionManager.js were traced only in the existing dedicated
QA VM's disposable Docker container: network none, read-only root/input, node
user, capabilities dropped, no-new-privileges,128MiB memory,1CPU,32 PIDs and16MiB
tmpfs. Only synthetic phone/OTP/access/refresh values and mocked axios/fs were
available. VM code generation was disabled and evaluation bounded. No owner
account, real credential, inbox or production filesystem was mounted.

Observed current request DTOs, not guessed endpoints:

- POST https://api.gobiz.co.id/goid/login/request:
  client_id=go-biz-web-new, phone_number=national digits, country_code=62.
  This differs from the historical full-phone/login_type request.
- POST https://api.gobiz.co.id/goid/token: grant_type=otp,
  data={otp,otp_token}, same client_id.
- Same token endpoint for grant_type=refresh_token:
  data={refresh_token,phone_number,country_code}.
- GET https://api.gobiz.co.id/goresto/v5/public/users/config:
  current login reads response.merchant.id and merchant.outlet_name.
- Current readable server uses the merchant-analytics/v2/merchants/transactions
  endpoint with from/size/start_time/end_time/merchant_ids/statuses/payment_types.

This proves shapes used by upstream code under mocks; it does not prove current
provider acceptance, a live connection or a successful payment. The native adapter
validates each response, rejects missing challenge/token/expiry/merchant data,
rejects redirects, bounds bodies/timeouts and never returns provider tokens/errors
to the browser. No missing transaction status defaults to success. Unknown,
refund/partial-refund, pending and failed mutations cannot settle.

## Database and release procedure

Only new migration20261115120000_gopay_payment_attempt adds nullable QR snapshot
columns and indexes, plus a connected-source opt-in CHECK. Existing source flags,
prices, orders, stock, history and old migration SQL are not changed. It was applied
only to the isolated local test database. Production remains schema33.

See docs/v1.8.3-release.md for the exact baseline, migration, backup, recovery,
worker revision, packaging and publication procedure. Deployment/publication gates
remain mandatory; use their actual receipts instead of inferring success here.

Local verification on Node22/PostgreSQL16:
- Production build/type validation passed; scoped lint32 source files had0 errors
  and4 image warnings (private authenticated QR endpoints deliberately use img).
-101 payment/security/database tests passed,2 optional provider/DNS tests skipped.
  Included exact-once concurrent blu/GoPay settlement, legacy policy preservation,
  manual-transfer regression, OTP/session limits, rotation retained on503,
  single401 refresh/retry, true second page, refund/pending/unknown refusal,
  cancellation protection, isolated access and PNG/JPEG/WebP decode/CRC.
- The production browser test exercised real seller configuration→OTP mocks→QR
  upload→activation→real shipping quote/checkout→customer check→PAID, then a
  second checkout paid by authenticated cron after its tab closed.390/1440px
  screenshots had no horizontal overflow or runtime errors. No real provider
  traffic, payment or production data was used. Sessions were synthetic; this
  does not claim an actual password login or live GoPay connection.
- Canonical33→34 rehearsal preserved33 historical ledger rows and all87 old table
  projections. Production dependencies audit reported0 vulnerabilities.
- Exact-edge executor tests and shared crash/backup/readiness/reconciliation
  tests are run separately; Linux rehearsal and production receipts remain the
  authority for real Docker/systemd/backup/migration results.

Review found and corrected a QRIS checkout bank-ID requirement, clock-based blu
opt-in classification, token loss risk after refresh rotation/profile outage and
legacy UI copy. New blu attempts carry an explicit immutable policy receipt in
the order transaction; old attempts keep their review-based behavior.

## Linux gate evidence before merge

Dedicated QA case `/opt/updater-lab/b1830001`, source
15a957eaa0e5a628fac0d76f7fe2229526ed123a, candidate archive
09ff3549ebf1e95b4c9feb52a1f2ceb2df08fec42c19add212204ca495128319.
This is a rehearsal artifact, not the final published release identity.

- Factory baseline came from unchanged public v1.8.2, with every runtime source
  byte authenticated before reusing its baseline images. The existing QA shop
  was not used as a relabeled baseline or migrated for this case.
- Actual official Controller/Engine/PaymentLiveForward upgraded33→34 under
  isolated Docker networks. Backup was restored into scratch PostgreSQL.
- SIGKILL injected after committed `migration_done` left the write fence and
  durable journal intact. Official reconcile succeeded without replaying SQL.
- All33 old ledger rows and all87 old table projections, including synthetic
  paid/pending orders, price snapshots, inventory and coupon, remained unchanged.
- Actual systemd timer drain/resume passed; a subsequent app-container restart
  preserved the same data. Final schema matched b88c7c76…a551a91.
-11 exact-edge tests and21 shared failure/lock/recovery tests passed on Linux.
- The catalog-only continuation passed actual Ed25519 signing/authentication,
  renewal and wrong-source/digest/tamper denials with disposable keys. No production
  key, real bank/carrier transaction or public catalog was used in this rehearsal.

QA receipts: `upgrade-proof.json` in the case and
`/opt/updater-lab/payments-catalog-audit/verification.json`. The final merged
artifact must be repackaged and matched to the unchanged tested app/installer
trees before Hubify apply. Production deployment and publication remain separate
gates recorded in their root-only journals and final release report.
