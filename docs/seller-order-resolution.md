# Seller order resolution workflow

Base audited: main d81f34720f358bef689632a0d8f2f1e865f808ab (v1.4.1).
This change is an additive order/payment/shipping workflow. It does not deploy anything, change DNS, run a real carrier order/cancellation, or transfer money.

## Audit and decisions

| Before | After | Why |
| --- | --- | --- |
| Financial, order and physical fulfillment states mixed in one detail page | Dedicated payment verification, shipment controls, cancellation review and resolution pages | One primary next action, independent state dimensions |
| Seller handover immediately marks the parcel shipped | `sellerHandoverAt` records a seller statement; authenticated carrier events drive physical progress | An AWB and a seller statement are not carrier pickup proof |
| Tracking network call held an Order row lock | Read snapshot, call carrier outside transaction, reacquire lock and verify shipment identity | Avoid long financial/stock locks and stale updates on replacement AWBs |
| Full-only legacy refund ledger referenced a store source account | New customer-owned destination, encrypted per case; partial immutable line/discount allocation | Never assume the seller's receiving account belongs to the buyer |
| Rejected proof could expire and release reservation | Correction remains open for financial review; explicit cancellation requires a no-funds attestation | A document problem does not prove no bank transfer occurred |
| Refund buried under a cancelled order | Counted `Kasus & refund` queue and persistent detail links for seller/customer | Outstanding financial obligations remain visible |

## Server state contract

OrderStatus/PaymentStatus enum values remain compatible. `CANCELLED + PAID` intentionally means a cancelled transaction with outstanding refund; it does not mean money was returned.

- Normal: proof -> verification/correction -> paid -> processing -> packed -> AWB -> seller handover fact -> carrier in transit -> carrier delivered -> explicit buyer completion. No automatic completion deadline is introduced.
- CANCEL case: REVIEW -> WAITING_PAYMENT or WAITING_SHIPMENT -> CANCELLED_NO_REFUND (no verified funds) or WAITING_BANK/READY (full refund owed). Confirm recomputes all conditions under the Order lock. Generic status APIs cannot bypass this financial review via CANCELLED or staff-driven EXPIRED. A parcel that left the warehouse uses RETURN instead.
- RETURN case: REVIEW -> mandatory policy/line/quantity/fees decision -> WAITING_RETURN (if required) -> inspection -> WAITING_BANK/READY. Rejection has a customer-visible reason. Returned stock increases only after explicit physical inspection and sellable-condition attestation.
- Money: READY -> TRANSFER_PENDING (destination/amount locked before manual transfer) -> TRANSFER_RECORDED -> RECEIVED, or DISPUTED + follow-up. TRANSFER_RECORDED is a seller claim with private evidence, not an automatic bank verification. Buyer receipt closes the case. Only full cumulative acknowledged refunds mark Payment REFUNDED; the original completed/cancelled order history is retained.
- J&T: PREPARED/DISPATCHED/UNKNOWN are durable states; matched per-order `Sukses` confirms cancellation. Definitive matched `Error` restores active AWB with a persistent rejection message. `CANCEL_ORDER` ambiguity remains pending reconciliation. No automatic create/cancel retry or replacement while uncertain. An operator may record an already-issued AWB after official evidence and exact external-order-ID matching (minimum 5 minutes); the operation is audited and never dispatches another create request. Current endpoint/signing contract is unchanged.
- A cancelled AWB keeps payment, stock and order intact. Reissue archives the old shipment/request and obtains a new provider external order identity through the existing adapter.
- Carrier-confirmed movement advances physical shipment/order progress even while a refund is open or acknowledged. It never completes an order or closes a case. Explicit completion remains blocked until financial holds are resolved. Returns require warehouse handover; pre-handover requests use cancellation. A refund never implies returned stock.

## Concurrency and privacy

All case mutations lock Order first. Revision checks, a partial unique open-case index, immutable transfer uniqueness and reference uniqueness reject parallel/double refunds. Refund allocation uses integer BigInt ratios against order-item snapshots, not current catalog prices. Earlier confirmed legacy refunds are included in the money budget and legacy endpoints cannot bypass a new obligation.

Every request rechecks active account / RBAC or order ownership in the database. Buyer bank/receipt/dispute operations require ownership even if that account also has a staff role. The installation still has one database per store; no shared-tenant architecture was introduced. An unrelated buyer cannot read cases or private proofs.

AES-256-GCM bank encryption binds the ciphertext to the resolution ID. The key is domain-separated from the per-installation JNT_INTEGRATION_ENCRYPTION_KEY already generated by the installer. An optional per-installation ORDER_DATA_ENCRYPTION_KEY may override it. Neither key is exposed to browsers or logged; absence fails closed with an operator message. Preserve the encryption key in backups; rotation requires an explicit re-encryption procedure.

Refund and return proofs reuse private local payment-proof storage (4 MB, magic/MIME validated, authenticated entity-ID access, private/no-store, nosniff, sandbox). Upload failures compensate object writes. Proofs are not public media URLs. Maximum 10 supporting evidence files per case. The existing 4 MB storage contract is retained rather than advertising unsupported 5 MB files.

In-app notifications and audit events are transactional. No new email/SMS/WhatsApp sending was added. Bank/account data and proof storage paths never enter audit metadata. User-supplied reason/evidence notes are private case data and rendered as escaped text.

## Schema / compatibility

Migrations: `20261109120000_order_resolution_workflow` and `20261109121500_resolution_transfer_review`.

Adds OrderResolution, OrderResolutionEvent, ResolutionTransfer and ResolutionEvidence; Shipment adds sellerHandoverAt, carrierEventAt and carrierCondition. No old table/column/enum/financial record is deleted or rewritten. Existing legacy refund APIs remain available for historical in-flight settlements, guarded against overlap with new cases. The legacy UI is linked only when an old request is still active.

The old updater rejects unfamiliar financial migrations by design. Do not bypass its guard by marking migration history without executing SQL. Operator rollout requires an explicit compatible migration manifest or supervised migration after backup, restore verification and rehearsal on a copy. This branch does not silently weaken the updater.

## Verification commands

Use Node 22 / PostgreSQL 16. DATABASE_URL and DIRECT_URL must target the isolated local `management_v130_test` database for destructive fixtures.

```text
npm --prefix app ci --ignore-scripts --no-audit --no-fund
npm --prefix app run security:prepare
npx --prefix app prisma generate --schema app/prisma/schema.prisma
npx --prefix app prisma migrate deploy --schema app/prisma/schema.prisma
npm --prefix app run lint
npm --prefix app run typecheck
TEST_DATABASE_ENABLED=yes npm --prefix app test
npm --prefix app run build
node tests/order-flow-browser.mjs
```

Browser fixtures run only on 127.0.0.1:3103 with disposable users, a private media directory, no mail credentials and no provider dispatch. Evidence is written to ignored `order-flow-evidence/`. The fixture includes a local-only product illustration and mocks no financial outcomes: actual HTTP/database paths record a synthetic refund claim and buyer acknowledgement. No real transfer occurs.

The original management browser/relay/other feature suites remain available; no need to rerun unrelated checkout/J&T pricing/OTP features for UI-only iteration. Changes to tracking/cancellation are covered by unit and PostgreSQL provider-mock tests including detail failure, timeout, reconciliation, reissue and handover races.

## Rollout and rollback (operator, after approval)

1. Pin the reviewed commit; check branch difference and running version. Confirm required per-installation encryption key exists without printing it.
2. Freeze operational writers briefly; take database + media + runtime configuration backup with existing manager tools. Verify restoration on a scratch database, then rehearse this migration and critical workflows on that copy.
3. Keep current image/package and reverse-proxy configuration. Build the reviewed application before touching the running service. Do not use bootstrap on an active store.
4. Apply the additive migration with the existing owner/migration role. Ensure runtime role privileges on new tables follow installer defaults. Activate only the intended store service; do not restart the central platform, relay or another seller installation.
5. Readiness + authenticated seller/customer smoke: list/detail/payment/case queue, proof access, ownership denial, no secret logs. Production carrier create/cancel and real refunds require separate explicit business authorization.
6. If activation fails before new operations are accepted, restore the previous image. Additive columns/tables can stay. If financial cases have already been written, do not run old workflow writers: keep writes paused and deploy a forward fix or a compatibility build that respects the new holds. Restoring an older DB would lose refund obligations; only restore a coordinated backup after explicit reconciliation, including private evidence and encryption configuration.
7. Never drop the new ledger as an emergency rollback. Reconcile externally created shipments and manually executed bank transfers before resuming writers.

## Integration limits

Provider tests use mocked J&T responses and the adapter's documented matched-order contract, not a live create/cancel. Manual refund evidence has no bank API, so it cannot assert bank settlement. Carrier transport uncertainty still requires existing official-channel/operator reconciliation. No wallet, escrow or gateway is created.

Provider contract reference: [J&T Indonesia developer documentation](https://developer.jet.co.id/documentation). Endpoint configuration and signature implementation were preserved.

## Renderer regression found during browser verification

Production browser tests exposed intermittent React hydration #418. Inspection of the emitted renderer showed the repository's existing runtime backports were absent: the webpack resource regex matched POSIX paths but failed on Windows production renderer paths. Normalizing resource separators and matching the exact renderer suffix enables the existing hash-pinned lost-ping and hydration-cursor backports; no framework/package version is changed. A new configuration-level test executes the actual webpack hook with both path styles and rejects lookalike/development/server targets. The existing upstream-source behavioral regression tests remain intact.

Reference: [React hydration replay fix](https://github.com/facebook/react/commit/c18662405cc4). Application-level loading boundaries remain explicit; hydration errors are not suppressed and SSR remains enabled.

## Verification evidence — 9 November 2026

Environment: Node 22.23.4, PostgreSQL 16, isolated local database, synthetic accounts and provider mocks. No production writes, CI run, real J&T dispatch or bank transfer.

- Unit + PostgreSQL integration: **586 passed, 3 skipped, 0 failed** across 78 files. The three skipped checks are existing Linux-only private-filesystem tests on this Windows host.
- Production build and its TypeScript validation: PASS. Lint: 0 errors, 35 warnings (image recommendations and unused declarations remain visible in the log).
- Browser: 24 workflow checks, 19 screenshots, widths 360 / 390 / 768 / 1440, zero runtime errors. The existing management browser regression also passed 66 checks.
- Private proof access and same-origin enforcement are exercised over HTTP; actual case, bank, transfer-claim, dispute and receipt mutations use the local database.

| Required scenario | Evidence / result |
| --- | --- |
| 1. Normal order through completion | `order-resolution.test.ts`: actual confirmation/approval/packing, mocked AWB, separate handover, carrier delivery, explicit owner completion — PASS |
| 2. Payment correction | Timely initial proof remains correctable after the original deadline; reason required in browser — PASS |
| 3. Cancel AWB and replace | `jnt-cancellation.test.ts`: archived old identity, distinct new provider ID, only one concurrent reissue — PASS |
| 4. Top-level success / detail failure | Official transport and cancellation tests retain active AWB on matched per-order rejection — PASS |
| 5. Create/cancel uncertainty | Durable UNKNOWN, no repeat dispatch, exact identity / official-reference reconciliation — PASS with mocked provider |
| 6. Cancellation racing pickup | Order lock serializes handover/cancel; late tracking response cannot affect replacement — PASS |
| 7. Unpaid / paid cancellation | Reservation release vs full refund obligation including shipping; paid dimension retained — PASS |
| 8. Payment approval during cancellation | Racing approval cannot produce verified funds without a refund obligation — PASS |
| 9. Full / partial / double refund | Integer discount snapshots, cumulative quantity/money budget, unique claim/reference, buyer receipt vs dispute — PASS |
| 10. Stock exactly once | Concurrent cancellation/inspection tests; no sellable return stock before explicit inspection — PASS |
| 11. Duplicate / stale carrier events | Deduplication, monotonic watermark, cancelled/replaced shipment guard, financial holds do not suppress physical truth — PASS |
| 12. Unauthorized access | Foreign buyer reads/writes/proofs denied, staff impersonation denied, HTTP proof 404 and CSRF 403 — PASS. Separate-installation isolation remains the existing one-database-per-store boundary; no shared-tenant model was added. |

Local screenshots: `order-flow-evidence/orders-390.png`, `payment-390.png`, `detail-1440.png`, `cancel-awb-sheet-390.png`, `cancellation-390.png`, `buyer-bank-390.png`, and `refund-ready-390.png`. Logs/results are in the same ignored evidence directory. Fixtures deliberately use a blue stored theme to verify that the new workflow does not hardcode black or the reference brand.

Ready for code review after the recorded checks. **Not deployed / not live**. Live provider cancellation and bank settlement remain unverified; they require specific business authorization. Apply the rollout/rollback procedure above before enabling the new financial workflow on an installation.
