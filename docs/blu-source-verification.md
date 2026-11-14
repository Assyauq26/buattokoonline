# blu signature review and release checkpoint — 2026-11-14

## Proven owner test

The owner issued a fresh Rp10,000 + Rp1 test with a ten-minute window. The actual
dashboard and read-only DB check found exactly one same-account IDR credit in the
issued transaction-time interval. The owner separately confirmed the funds in the
blu banking app. The old Rp20,131 and expired Rp1,001 tests were not retrofitted.
No claim, PAID transition, stock change, sale or shipment was made for the test.

This closes the owner transfer/matching gate. It does not establish an automatic
settlement protocol, global cross-installation claim registry or source identity
for every future message.

## Implemented signature verification

`blu-dkim.ts` uses pinned mailauth 8.0.6 to verify the original RFC5322 bytes,
strict syntax, exact `blubybcadigital.id` signing/From domain, RSA-SHA256 with at
least 2048 bits, valid signature time, a matching full-body hash and signed From,
Date, Subject, Message-ID, MIME-Version and Content-Type. Partial-body signatures,
duplicate critical fields, unsigned critical headers, weak/foreign/expired or
changed signatures cannot pass. Authentication-Results text alone is never trust.

Input/header/signature/DNS-count/time/response-size limits are enforced. DNS is
restricted to bank DKIM TXT selectors. A fixed HTTPS Google DNS fallback receives
only the public key name; no body, account, sender or message ID is transmitted.
DNS failure preserves manual review. No raw mail, canonicalized headers, public
key, provider error or secret is stored/logged. The audit stores a versioned
result code, raw SHA256 and observation fingerprint only. Identical replays do
not add duplicate audits, and a previous pass cannot authenticate a changed
evidence record or a later failing check.

The detail page distinguishes a verified bank-domain signature from a financial
settlement. The observation remains UNKNOWN/untrusted for financial processing
and retains MISSING_STABLE_TRANSACTION_ID. Email deduplication is not presented
as bank-transfer deduplication. No claim/activation/PAID API is added. All sources
and checkout methods remain off. Matching still uses exact payable + bank time;
no payer-name or reference condition is added to matching.

Private original-mail verification and a tampered-body negative control passed
against actual current public DNS. Synthetic generated-key tests also exercise
forged headers, altered body/subject, partial signatures, unsigned MIME headers,
expiry, foreign DNS, failures, bounded HTTPS fallback and audit binding. No user
email or signing key is committed. The original provided file remains private.

## Limited deployment edge

`deploy/hubify-blu-auth-cutover.py` selects a separately pinned AuthNative driver:
baseline e6cc5eb, package c9a2b69c…, image 129a6f78…, app tree 4cc61bfd…. It does
not rewrite those identities or receipts. The original test driver retains its
original aeb4846 edge. A separate `hubify-blu-auth-cutover.json` recovery journal
adds only one restrictive worker guard. Exact runtime/schema/ledger/credentials/
J&T/disk checks, operation lock, scoped fencing, verified backup/scratch restore,
immutable 87-table snapshots and code-only recovery remain in force. No schema
change/migrate SQL runs. All 32 historical migration files stay unchanged.

The candidate also includes the minimum/default base correction to Rp10,000.
Actual deployment SHA/package/image and actual live signature results belong in
PR56 and the complete journal, not assumed from these predeployment tests.

## Public-release gate remains separate

Current public v1.8.1 has 31 migrations. This candidate has 32. The existing v3
native adapter in `update_service/policy_feed.py` and `native_forward.py` is pinned
to the published 29→30 / v1.7.4→v1.8.0 edge. The generic grammar rejects the new
review-only evidence SQL's CHECK/default/FK syntax. A successful private Hubify
operator cutover does not authorize changing that signed public upgrade path.

Public release therefore still requires a separately reviewed executor/worker
capability and signed catalog policy for the actual public 31→32 baseline, with
upgrade/recovery rehearsal. Do not broaden generic SQL grammar, change historical
bytes/ledger, fabricate a baseline, publish an unsupported compatibility promise,
or trigger updates on other stores. Google remains External/Testing; general
OAuth distribution and supported-bank/payment activation remain separate gates.

Owner authorization to release once safe persists; the remaining gate is technical,
not a request for repeated approval. Until it passes, the release decision is
NO-GO for public payment activation/public updater distribution. Keep PR draft,
public tag/artifacts unchanged and the Hubify pilot scoped to enrolled Admins.
