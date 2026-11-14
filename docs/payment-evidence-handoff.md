# Resumed review — 2026-11-14

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
