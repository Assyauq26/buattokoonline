# Hubify blu review pilot — 2026-11-14

## Decision: BLOCKED / NO-GO for deployment

The owner authorized a Hubify-only deployment after safety gates. This supersedes
the earlier preparation-only restriction; no additional general deployment consent
is needed. It does not authorize bypassing guards, disabling J&T Production,
publishing a fleet catalog or settling payments. No production mutation was made.

PR #56 started this continuation at `a536fb3`. The worktree was clean, remote head
matched, `main` remained `e885ca4`, and no other active agent was found. No other
worktree was edited. The final source commit is recorded in the PR and source
bundle; no release tag/version/catalog is created for this draft.

## Actual Hubify baseline (SSH read-only, not inferred from Git)

- App/runtime: **1.8.0**, source `7e81f8e60b27ab5695ac50ac6b653b63095e36d1`.
- Image: `sha256:46543294c7c4c6289f4434bcb904ce7031156149697ec0b3a5a0a4cee0624025`.
- Existing artifact digest: `2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`.
- All **30** ledger entries finished, none rolled back. Candidate has 32 SQL files:
  the already released customer-order index plus the draft evidence migration.
- App healthy; updater service and maintenance timer active. Production J&T API,
  order approval and order-create flags all remain `yes`.
- Gmail client ID/secret, preview/OAuth flags and integration encryption key are
  absent from the effective app environment. Installation identity exists.
- Owner confirmed that no Google Cloud project exists yet. No real OAuth consent,
  mailbox read, token refresh/revoke or new bank transfer has been tested.
- Available disk approximately **4.90 GiB** (87% used). Existing cutover budget is
  **6 GiB + twice persistent data** before building: current free space fails it.

### Guard evidence and historical bytes

Read-only invocation of the installed staging helper's `preflight()` returns
`J&T Production tidak boleh diaktifkan di staging.` No apply was attempted.
`deploy/hubify-candidate.py` permits no schema change. The existing production
executor accepts only its pinned 29→30/v1.8.0 edge. The generic migration validator
rejects the evidence SQL's CHECK/default/FK grammar. None is authorization for
30→32, and none was disabled, broadened or bypassed here.

Two historical ledger/file differences are confirmed line-ending-only:

| Migration suffix | Original/ledger SHA256 | Git and active release source SHA256 | Bytes CRLF→LF |
| --- | --- | --- | --- |
| order_resolution_workflow | `789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac` | `865ec38af4482060322ba0dc89becc9132881d7bbb7f7e633b669af30e0444ec` | 3116→3097; 19 CRLF |
| resolution_transfer_review | `d67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483` | `22cb34b1d3840926b42356fb333c0678f5a0ea850ee3c3b8b1f9373cc92a885b` | 356→354; 2 CRLF |

Original files retained on the VPS normalize byte-for-byte to the active source
and candidate. Historical files/ledger remain intact. The old historical
compatibility function is pinned to earlier source/target edges, so this evidence
does not grant a new unchecked exception for this candidate.

## Pilot implementation

- Preview flag **and** explicit `PAYMENT_EVIDENCE_ADMIN_IDS` allowlist **and**
  `Admin` role **and** `bank.manage`/`payment.read` permissions are required.
  Empty allowlist fails closed. UI pages, command API and OAuth callback use it.
  Other backoffice roles or unenrolled Admin accounts cannot access the pilot.
- Settings provides **Baca notifikasi blu** after Google connection. One click
  reads up to five messages, with durable pagination and a one-minute cooldown.
  Initial query covers the last 24 hours and only blu-shaped incoming notices.
  This filter limits requested messages, not Gmail's broad readonly scope or
  sender authenticity. There is no installed scheduler.
- Tokens are encrypted with installation/source/purpose AAD. Refresh commits
  under the current lease/generation; disconnect invalidates late reads. A stale
  generation cannot acquire a new lease. Error bodies/tokens/raw mail are not
  returned to the UI or logged. Raw email is parsed in memory, not persisted.
- Retries/restarts replay safely through persistent message deduplication; a cursor
  advances only after the page is stored. Reconnect clears pagination/backoff.
- Observations remain untrusted/review-only. Candidate matching uses exact total
  including unique code and issued 5/10-minute time window; no payer name/bank
  reference requirement. Ambiguous, duplicate, late or incomplete evidence stays
  for manual review. The pilot API no longer accepts even a claim/association action.
- Public checkout and automatic settlement are untouched. Source activation is
  also prohibited by the existing database CHECK. No old order is repriced or
  retrofitted with a unique code to manufacture a candidate.

| Before | After | Why |
| --- | --- | --- |
| Payment readers could open preview screens | Only explicitly enrolled Admin users can access pilot | Limit real mailbox exposure |
| OAuth source code had no dashboard read action | Bounded manual read with progress text, cooldown and result count | Make the first mailbox test inspectable |
| Review could offer association for trusted fixture records | Pilot UI/API expose no association action | Keep the pilot observational |

## Verification evidence

- **111 tests passed**, including the opt-in private original blu email parse,
  amount/window regression, native PostgreSQL duplicate/pagination/retry, stale
  generation, disconnect-during-read, permission/tenant/flag and redaction checks.
- Production build, typecheck and scoped ESLint passed. Existing unrelated
  Tailwind ambiguous-easing warning remains; it is not a new build failure.
- **21 responsive browser checks passed** at 390px/1440px with no runtime errors
  or overflow, using synthetic signed local sessions. Includes unenrolled Admin
  denial, unavailable OAuth configuration and rejected claim/activation commands.
- A fresh isolated schema was migrated from all 30 SQL files of the actual
  deployed Git source. Synthetic pending/paid orders, line snapshots, payments,
  SKU inventory, coupons/history were seeded; `prisma migrate deploy` applied
  30→32 successfully. Snapshot stayed
  `a93743cf2b921b6d23ebb2375dcffa3f4d833bcb5b384e9c3a14dbb34230b5fe`.
- The consistent pre-upgrade local `pg_dump` was restored into a separate local
  database: 30 finished migrations and the same snapshot. This proves a local
  recovery rehearsal, **not a current production backup**. Both databases contain
  synthetic data only. The real production checksum edge still requires review.
- Read-only HTTP smoke on the existing live version passed storefront, login page,
  product, seller product/Promosi, customer account/orders and an existing campaign
  detail. Voucher detail was unavailable because none exists. Signed probes use
  existing identities; actual password login and new checkout/payment/J&T requests
  were not performed. These are baseline checks, not post-deployment checks.
- Every historical SQL file/lock remains unchanged against the branch base.
  No SQL/ledger, installed helper, app image, carrier flag, public release or
  central-platform configuration was changed in this continuation.

Local evidence is retained under `audit-tools/payment-evidence-upgrade30`,
`audit-tools/payment-evidence-pilot-browser`, `payment-hubify-preflight.json` and
`payment-live-readonly-smoke.json`. Private original mail stays outside Git.

## Google Cloud steps the owner must complete

1. Create/select a project in https://console.cloud.google.com/ and enable Gmail API.
2. Configure Google Auth Platform branding/audience. For a personal Gmail pilot,
   use External/Testing and enroll the dedicated notification Gmail as a test user.
   Testing is not public verification; relevant Gmail refresh tokens expire after
   seven days. Do not change to public distribution merely to avoid that limit.
3. Request only `https://www.googleapis.com/auth/gmail.readonly` for this pilot.
   It can read the mailbox broadly; prefer a dedicated bank-notification mailbox.
4. Create OAuth Client ID, application type **Web application**, exact redirect:
   `https://hubify.web.id/api/v1/admin/payment-evidence/oauth/callback`.
5. Keep the downloaded client configuration private. Provision ID/secret through
   an authenticated operator session/secret configuration, never chat, issue/PR,
   Git, screenshots, shell history or a public upload. Google account login and
   consent must be completed by the owner. No password/OTP is needed by the app.

Official sources checked 2026-11-14:
[Gmail server authorization](https://developers.google.com/workspace/gmail/api/auth/web-server),
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[OAuth token expiry](https://developers.google.com/identity/protocols/oauth2).
Project/client/API enablement, test-user membership and verification status must
be checked in the actual Console; none is claimed configured now.

Required effective app configuration, only on Hubify after approved cutover:
`PAYMENT_EVIDENCE_PREVIEW=true`, explicit `PAYMENT_EVIDENCE_ADMIN_IDS`,
`PAYMENT_GMAIL_OAUTH_TEST=true`, `PAYMENT_GOOGLE_CLIENT_ID`,
`PAYMENT_GOOGLE_CLIENT_SECRET`, `PAYMENT_INTEGRATION_ENCRYPTION_KEY` (32 random
bytes, canonical base64), and the existing `STORE_INSTALLATION_ID`.
Generate the encryption key on-server without printing it; retain it with the
encrypted-token backup. Do not overwrite an existing key or installation ID.
Preserve every unrelated Compose/env setting and all J&T approval values.

## Remaining cutover/recovery work — no apply command exists for this edge yet

Before deploying, extend/review the official operator executor for the exact
Hubify 30→32 edge, pinned candidate source/digest and authenticated baseline.
It must preserve checksum/baseline/backup/locking guards and leave the generic
updater closed. No ad-hoc Docker/SQL deploy script is an acceptable substitute.
Current disk capacity must also be resolved without deleting rollback images,
backups or another agent's files blindly. No central-platform change is required
for a per-Hubify Gmail client or these local tables; do not change the public feed.

The executor needs fresh checks of image/source/ledger/schema, worker and carrier
activity, shared operation lock, proxy preservation, disk/memory, private logging
and backup storage. Hold the reviewed write fence, drain checkout/webhooks/carrier
work and pause relevant timers; do not disable J&T approvals or kill active jobs.
After writers drain, take a consistent DB/config/media/application backup and
verify it with scratch restore, recording before/after digests and phase journal.
The earlier local dump is not that backup. Abort before migration if these gates fail.

Run the new migrations through the existing Prisma tools with bounded lock/statement
timeouts. The customer-order index scans/locks Order writes; evidence FK creation
also acquires locks against Payment/BankAccount. Use a short reviewed maintenance
window, not an assumption that CREATE-only SQL never blocks. Keep old ledger rows
byte-for-byte and verify old order/payment/catalog snapshots before opening traffic.

Rollback code and restore database are different operations. These additions do
not rename/drop existing columns or update financial rows: old app code can ignore
the new tables/index while the pilot remains observational. Preserve new observations,
leases, account links, tokens and ledger; do not drop tables to roll back code.
Stop manual reads/disable the preview and restore the exact previous app/Compose
using the verified image. Recheck health and carrier flags, then resume workers.
After migration interruption, inspect the real ledger/transaction and journal;
never blindly rerun migrations, `migrate resolve`, or edit checksums. If state is
uncertain, hold the fence for operator recovery. A real DB restore requires a
separate loss/reconciliation decision; never automatically overwrite new orders.

After a successful future activation, verify exact app SHA/image, 32 finished
migrations, authenticated allowlist/denial, masked credentials, manual payments,
storefront/checkout and unchanged J&T flags without shipping/payment mutations.
Confirm timers/worker/cache/maintenance state is restored. No paid mutation is
allowed in smoke. Only then ask the owner to connect Gmail from
`/admin/settings/payment-methods/gmail-bank` and read notifications, with results
at `/admin/payments/evidence`.

For the owner's small bank transfer test, wait until deployment/consent/read are
actually verified. The owner performs the transfer in the bank app, waits for the
notification and clicks Baca notifikasi blu. Matching candidates require a real
issued attempt with the same total and 5/10-minute window; this pilot deliberately
does not create a fake order or reprice a manual order. Without one, the email can
be visible with zero candidates. The original historical sample is outside the
24-hour live query and is not proof of a new mailbox/transaction test.
