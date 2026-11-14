# Paused checkpoint — 2026-11-14

Paused explicitly by the owner before laptop shutdown. Do not resume feature work,
deploy or activate until the owner asks to continue. PR #56 remains a draft.

Branch/worktree: `codex/payment-evidence-methods`, `payment-evidence-methods`.
Prior pushed head: b8271d7. This checkpoint is WIP, not a completed release candidate.

## Latest owner decisions

- First bank: blu by BCA Digital; other banks undecided.
- Provided EML is a format example, not the nominal to hardcode.
- Main matching criterion: exact total including unique code (example Rp45.341),
  plus transaction time inside a 5- or 10-minute window. Payer name and bank
  reference must NOT be required to find a matching order.
- Sender authenticity, tenant/account isolation and durable duplicate protection
  remain operational safety guards. Do not interpret a format match as permission
  to deploy/activate or bypass the previously required end-to-end testing.

## Completed in this continuation

- Verified clean initial branch/PR head; PR #56 open/draft, same branch.
- Read original EML privately. Actual structure: multipart/mixed with one UTF-8
  text/html part encoded quoted-printable; no text/plain part. Amount spans nested
  HTML nodes. Full sender/recipient addresses, names, account digits, amounts,
  dates, Message-ID, signatures and original body are NOT copied into this repo.
- From/Return-Path/DKIM domain: blubybcadigital.id. Header claims mx.google.com
  SPF/DKIM/DMARC pass. References is present and must not be mistaken for forwarding.
  No reliable bank transaction reference was identified in the supplied template.
- Independent original DKIM check with mailauth 8.0.6/current public DNS passed:
  bank-domain signature, rsa-sha256, matching full body hash, valid signature time,
  no partial-body signature. In-memory tamper control failed as expected. This is
  a one-file offline audit, NOT a live Gmail/production authentication implementation.
  SPF/DMARC were inspected as header claims, not independently verified.
- Audit-only library/script is outside Git under audit-tools/blu-dkim-node. Original
  EML remains in the owner's Downloads; never commit it or log its contents.
- Pinned runtime dependencies postal-mime 4.2.1 and parse5 8.1.1. Added bounded inert
  MIME/HTML decoding, conservative review-only normalization, hashed email-observation
  identity, raw Gmail read transport, and scoped internal review-only ingestion seam.
- MIME fixtures are minimal synthetic reconstructions. Original local opt-in test
  uses BLU_ORIGINAL_EML_PATH, asserts booleans only, and privately cross-checks amount.
- Tested duplicate deliveries/parallel ingestion, fresh-client persistence,
  indistinguishable same-amount events, no-bank-ID hold, cross-tenant and stale leases.
- Last completed validation BEFORE the final matching-helper additions below:
  93 tests passed across 8 files (including the opt-in original-file parsing check),
  TypeScript and scoped ESLint passed. No new bank transaction, Gmail connection,
  merchant configuration or production mutation occurred.

## WIP at pause / next steps

1. Newly added amount-window.ts implements exact amount + issued interval matching
   and 5/10-minute deadline calculation. candidate-suggestions.ts adds a read-only
   DB query without payer/reference requirements. These additions have NOT yet
   been integrated into the review page or tested/typechecked since being written.
2. Existing page still hides suggestions for missing bank IDs; wire the new read-only
   suggestions into the page so blu emails can show amount/time matches even without
   a bank reference. Clearly separate suggested matches from confirmed payment.
3. Add meaningful tests for Rp45.341, 5/10-minute boundaries (expiry exclusive),
   zero/multiple candidates, concurrency/collisions and late/changed deliveries.
   Integrate deadline helper into future/new attempt creation as appropriate; no
   production checkout activation is authorized.
4. Review earlier stable-bank-ID requirements in claim/policy/docs in light of the
   owner's latest matching preference. Do not mislabel email Message-ID as a bank
   transaction ID. Matching can work without it; financial mutation remains disabled
   until the agreed operational gates have actually been completed.
5. Run affected tests/typecheck/lint and production build after final changes.
   Build has NOT been rerun for this EML continuation/new runtime dependencies.
6. Update docs/payment-evidence.md and PR #56: its older missing-EML statements and
   previous matching discussion have NOT yet been revised for the EML findings and
   latest owner decisions. Preserve historical test results as historical evidence.
7. Keep feature flags/check constraint OFF, no scheduler installation, no automatic
   PAID update, no deploy, no tag or release. No historical migration or ledger edits.

## Local lab and retained evidence

Dedicated local PostgreSQL 16 lab: loopback port 5568, database
hubify_payment_evidence_test, data directory audit-tools/payment-evidence-pg16.
Stop it for the requested pause; data/backup artifacts remain on disk. Existing
32-migration lab schema was reused, with only synthetic test rows added. No schema
or migration SQL changed in this continuation. All original production stores and
the central platform were untouched. Existing backup/dump artifacts remain outside Git.
