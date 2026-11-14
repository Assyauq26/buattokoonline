# Hubify pilot continuation — 2026-11-14

Latest update: owner-created Web OAuth JSON was privately validated, including the
exact Hubify callback, and staged root-only at
`/etc/single-store/payment-evidence/google-client.json` (0600; parent 0700), under
the operation lock. No secret was logged/committed, and the file is not loaded by
the app. Post-stage health/source and J&T flags are unchanged. Google project/client
now exist; API enablement/test users/scope/consent remain unverified. No Gmail
connection or deployment occurred. Earlier "no project yet" observations below
are superseded by this checkpoint; executor/disk/backup gates still apply.

The latest owner attachment authorizes a Hubify-only observational deployment
after safety gates, with no new checkout method or automatic PAID. That overrides
the earlier preparation-only deployment restriction, but never overrides guards.
See [payment-evidence-hubify-pilot.md](payment-evidence-hubify-pilot.md) for current
status, exact production baseline, configuration, migration/backup and recovery.

Current status: **BLOCKED / NO-GO deployment**. Existing live app remains v1.8.0
at 7e81f8e; 30 completed migrations, healthy, J&T Production flags preserved.
Installed staging preflight explicitly rejects active Production J&T. Candidate
needs 30→32 (including the released order index), a separately reviewed official
executor/checksum edge and disk headroom (4.90 GiB available vs 6 GiB + data budget).
Google OAuth client/key/flags are absent; owner has no Google Cloud project yet.
No production/central-platform mutation, merge, tag, public artifact or catalog change.

New code adds fail-closed enrolled-Admin access and manual blu email reads (five
per page, one-minute cooldown), persistent pagination/dedup and disconnect fencing.
The pilot UI/API cannot associate or settle payments. 111 tests, 21 local browser
checks, build/typecheck/scoped lint passed. Fresh synthetic schema30→32 rehearsal
and pre-upgrade backup restore preserved snapshot a93743cf2b921b6d23ebb2375dcffa3f4d833bcb5b384e9c3a14dbb34230b5fe.
Live read-only baseline smoke passed; neither actual password login nor live
Gmail consent/read/new transfer was tested. Do not claim a deployment occurred.

## Earlier resumed review

The owner resumed work from saved checkpoint 7b8f438 by saying "lanjutkan".
The prior laptop-shutdown pause is no longer active. Worktree/branch remains
payment-evidence-methods / codex/payment-evidence-methods, Draft PR #56.

Latest matching decision: exact total including unique code, plus transaction time
inside a 5- or 10-minute issued window. No payer name or bank reference is required
to find an order. Default issuance is 10 minutes; expiry is exclusive. Authentication,
tenant/account routing, idempotency and order lifecycle are separate system guards.

## Implemented after resume

- Tested and connected amount-window helpers; new order/attempt share the deadline.
- Read-only suggestions find matching orders even without a bank reference and show
  base + unique code = exact total, including the owner's Rp45.341 example.
- Page distinguishes matched amount/time from paid status; no new PAID mutation,
  checkout option, live mailbox, scheduler, deploy, merge, tag or release activated.
- Complete original EML was privately parsed/compared with synthetic fixtures;
  no private original, personal data, header IDs or signatures were committed.
- Independent original DKIM/current-public-DNS check passed and tampered body was
  rejected. Occasional DNS lookup failures must hold verification, never imply trust.
- 106 targeted tests passed, TypeScript/scoped lint passed. Production build and
  all 18 final responsive browser checks passed; final results and
  remaining gates are maintained in docs/payment-evidence.md and PR description.
- No migration/ledger changes during resume. All 31 historical SQL files plus the
  lock file match base Git bytes (32 files, zero differences).

## Remaining operational gates

Review source code/UI and operating procedure. Authorized Google project/client,
exact redirect URI, applicable verification/exception and live consent/token tests
remain required for a real mailbox pilot; no credentials should be sent in chat.
Additional blu transfer/notification variants, duplicate/reissued delivery and a
limited authorized new transaction still need end-to-end validation. No bank
reference is needed for matching; do not invent one from email Message-ID.
GoPay authentication is still blocked on an auditable authorized protocol.
Checkout activation, automatic settlement and updater migration/quiescence support
remain separate work, not authorized for production in this task.

## Retained local lab

Loopback PostgreSQL 16: port 5568, database hubify_payment_evidence_test; data under
audit-tools/payment-evidence-pg16. Only synthetic rows were added. Stop this local
lab after verification and preserve existing backups. Private original remains in
the owner's Downloads; audit-only DKIM tooling stays outside Git in
audit-tools/blu-dkim-node. Browser evidence uses signed synthetic sessions, not
real seller/Google login or new money movement. Central platform/VPSs are untouched.
