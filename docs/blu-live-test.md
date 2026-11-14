# blu live transfer test and release gate

## Scope and entry point

Owner authorized implementation, Hubify deployment and release once safe. This
continuation supplies the missing issuance-to-email-match test at
`/admin/payments/evidence/test`. Public checkout, automatic settlement and other
installations remain unchanged. This is a real transfer observation test, not a
product purchase. Never describe a matched email as authenticated settlement.

The prior live pilot is version 1.8.1, commit
`aeb4846308544c544e1019998f5edf3d2e6fb3b1`. Owner consent and a real incoming
notification for Rp20.131 were verified in the live dashboard. That event predates
new issuance and cannot be retrofitted onto a new order. No claim/PAID was created.

## User flow

1. Enrolled Admin opens Gmail settings and selects **Uji transfer blu**. Gmail
   must be connected, the receiving bank version active, and a read successful.
2. Choose a base amount Rp1,000–Rp50,000 and 5 or 10 minutes. Issue once. The
   server adds Rp1–Rp999 under the receiving source lock, reserves the exact total
   for seven days beyond expiry, and creates a new clearly marked BLU-TEST order
   and payment in the same transaction. There are no items, stock, coupons,
   shipping addresses, carrier orders or payments marked paid. Subtotal and total
   are the full test transfer; attempt records preserve base/code separately.
3. Owner independently makes the real transfer in their bank app. The agent does
   not perform a bank transfer or choose payment credentials. The amount and bank
   number can be copied; no old amount or email is reused.
4. After notification arrives, **Baca email blu** runs the existing bounded manual
   reader (five emails/page, one-minute cooldown). Status polling every ten
   seconds reads local DB state only; it does not repeatedly call Gmail.
5. Exactly one same-source/account/IDR-credit/exact-amount observation with bank
   time in `[issuedAt, expiresAt)` shows a match. Zero stays pending/expired;
   multiple or source-changed observations require manual review. A delayed
   email may be matched after the deadline if its transaction time was in range.
   No name/reference requirement is introduced. No match changes financial state.
6. Test orders can cancel/expire, never become PAID/refunded/fulfilled. Generic
   proof submission/upload/approval and evidence association reject test payments.
   Any money already transferred is checked in the owner's bank account; no
   automatic refund or second payment instruction is generated.

Requests have per-admin UUID idempotency, payload consistency checks, one active
test/admin/source, server-only RBAC/enrollment/preview checks, same-origin POST,
scoped reads, no-store responses and retained issuance audit. Retrying a committed
request never creates another transfer total. No historical order is repriced.

| Before | After | Why |
| --- | --- | --- |
| Email could be read, but no live amount/window could be issued | Dedicated Admin test page with issuance, countdown, copy, read and result | Test the complete matching path without public checkout exposure |
| No visible relationship between a notification and a new attempt | Exact source, total and bank-time result with ambiguous state | Keep outcomes inspectable without claiming payer identity |
| Generic payment pages could accept a new test-shaped order | Explicit test method blocked from proof, approval, association and fulfilment | A test cannot turn into a sale or shipment |

## Deployment and recovery

No schema change: all 32 SQL files, Prisma schema and lock bytes must remain equal
to the deployed baseline package. `deploy/hubify-payment-test-cutover.py` uses the
existing official durable Cutover engine and operation lock. It authenticates the
exact previous pilot source/package/image/runtime bytes, completed receipt,
installation, full ledger and schema, protected credentials, disk/resources,
worker idleness, shared proxy and Production J&T flags. Unknown drift fails.

Build only a new app image; tools and private env files stay unchanged. Recheck
before outage, stop updater/timer, add only the new restrictive recovery journal
to the existing pinned worker guards, fence Hubify alone, drain app, hash every
public table and full ledger, create/verify a DB/media/config backup including
scratch restore, then run a verification-only stage. No migrate/grant/ledger SQL
is executed. Activate exact image, check readiness/source/flags/config, record
truthful private metadata and baseline, reopen proxy, resume workers. Package and
source SHA are recorded in the journal and PR; this is not a public release.

The new journal is `/etc/single-store/hubify-payment-test-cutover.json`. Old
receipts and root-only worker originals remain intact. Reconcile interrupted
build/backup only after inspecting external work and explicit operator attestation.
The same schema does not imply that build/backup completed: before the durable
no-op-stage intent, reconciliation returns to the old app, not forward activation.
Unknown ledger/schema drift keeps the fence. Recovery after activation restores
only the retained prior app/Compose and truthful metadata under the operation
lock after draining; preserve all new observations/test orders. Never restore an
old database over transactions written after traffic reopened.

## Release decision

The latest public GitHub release is v1.8.1; the private deployed candidate also
reports 1.8.1. Do not alter that public tag/artifact. Next public version is v1.8.2
under the existing patch-release convention, subject to a fresh catalog check.
No release is permitted based solely on a parser match or synthetic tests.

Before public distribution: owner must test a newly issued amount/window and
confirm receipt in their bank independently, ambiguity/expiry/retry/access gates
must pass, Google distribution/Testing restrictions must be resolved or explicitly
limited to supported operator enrollment, and the updater must have a reviewed
31→32 schema edge for existing v1.8.1 sellers. The private 30→32 Hubify executor
does not authorize that fleet edge. Public activation/automatic settlement require
a verified provenance and settlement design; neither is enabled by this test.
Do not publish an artifact that pretends these gates passed. Owner's release
authorization persists; there is no need to ask again once the gates really pass.
