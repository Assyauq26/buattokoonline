# Payment continuation — 2026-11-15

## Verified baseline

PR56 remains draft, based on main e885ca4. Live Hubify is the private 1.8.1
pilot at 8e65f4a74eb7b597afa27e87f28e3a5d141da1c2, image
4f4618b3fdbc141649f6d80c16d2250f3329e1fc6a973811dc5c6d041c1d3404.
The fresh read-only smoke passed all ten public/admin/customer pages, permission
and CSRF boundaries, workers, 32 migration rows and the schema hash. Source
activation count and financial claims remain zero; J&T flags remain unchanged.
The Rp10,001 owner transfer and bank-domain DKIM result remain valid prior evidence;
no additional transfer is required. A new live merchant test has not occurred.

No production worker/app installation, database migration, public merge, tag,
catalog publication or fleet update is part of this checkpoint. The current
pilot remains available; this document must not be presented as a completed
checkout/payment implementation.

## Independent updater implementation

`update_service/evidence_forward.py` adds a distinct
`payment-evidence-forward-v1` signed-policy executor for the exact public
1.8.1 -> 1.8.2, schema31 -> schema32 path. This is not generic SQL grammar
expansion or authorization for a later activation migration.

It pins the published baseline source, app tree, complete app file-inventory
digest, all 31 historical migration checksums, before schema, exact additional
SQL checksum and after schema. Existing order/item/payment/stock/promotion
columns are hashed without the promotion adapter's column exclusions. Six new
evidence tables must be empty before traffic opens, and enabled sources must
remain zero at readiness. The legacy promotion adapter retains its own profile.

Discovery, apply and recovery select the same adapter. Recovery uses the
persisted policy and reauthenticates current signed catalog/policy; it does not
guess an edge from the partially migrated database. The existing lock, durable
intent, carrier drain, ingress fence, verified backup/scratch restore, SQL intent,
forward-only recovery and no-old-database-restore rules remain in force.

Worker wire protocol remains 3, but this capability requires an independently
reviewed operator-installed worker revision. Existing workers reject the new
executor. Publishing a catalog policy cannot replace a worker. Do not promise
one-button installation on an older revision or widen the generic grammar.

The candidate still has private VERSION1.8.1 and private 1.8.0 compatibility
metadata. It is intentionally not a publishable v1.8.2 package. Freeze final
application scope, set truthful metadata, rebuild, authenticate the final merge
artifact, test actual revised-worker cutover/recovery, and sign catalog policy
before claiming the public gate complete. Never overwrite public v1.8.1.

Tests: 106 passed on Linux, three Node-specific probes skipped there; those three
Node probes and three additional native-boundary tests passed on Windows with
Node22. Linux coverage includes actual atomic worker-directory exchange and
interruption tests, durable forward-state-machine failures/reconciliation,
real Ed25519 policy signatures/revocation/cohort/artifact binding, baseline/SQL
tampering and financial snapshot preservation rules. These are not a substitute
for a full revised-worker VM cutover with Docker/systemd and real schema31.
The prior actual Prisma31->32 upgrade/old ledger/representative financial-data
rehearsal is still applicable because all SQL bytes are unchanged.

The new adapter's actual ledger/schema verification also passed against the
isolated PostgreSQL16 public181-ascii lab (32 rows,81 old tables hashed). The
earlier financial/ledger rehearsal receipt was reverified and the local database
stopped cleanly. No production SQL was run. Canonical worker source now retains
all five known operator-cutover guards, with incomplete/unknown phases rejected.
The old promotion test incorrectly inspected this later private candidate's
release-policy.json; it now checks exact hash-pinned policy bytes from the
immutable published7e81f8e release. No live release metadata was altered to pass.

## GoPay repository audit: readable authentication found

The upstream HEAD remains c753b8c23daf5ced58febe650bcd229b6b2b7dec. History was
downloaded as Git objects and inspected as text only; no upstream program was
executed and no merchant account, OTP, cookie or token was used.

Readable OTP request/verification exists in commit
2f9444e (`server.js`, `/auth/request-otp`, `/auth/verify-otp`):

- `https://api.gobiz.co.id/goid/login/request`: phone, OTP login type and public
  client ID `go-biz-web-new`.
- `https://api.gobiz.co.id/goid/token`: OTP grant with challenge and OTP.
- It accepts several response envelopes and returns tokens to the caller.
  Those permissive fallbacks/token exposure must not be copied to Hubify.
- Its auto-login path uses a separate password grant; it is not evidence for
  an OTP-only refresh protocol and must not be used as an assumed fallback.

Commit168130f introduced the obfuscated login/session modules; current HEAD
still contains them. Obfuscation alone is not evidence of malicious behavior.
The historical readable flow is evidence of a past implementation, not proof
of the current provider contract or permission to mark a merchant connected.
Current challenge/expiry, refresh rotation, merchant binding, pagination and
transaction-status behavior remain unverified. No guessed refresh grant,
browser cookie import, default merchant ID or provider-success fallback is
authorized by this audit.

The current readable transaction adapter still requests offset0, includes
refund statuses and has permissive amount/status/ID fallbacks. Its in-memory
claims are deleted after24 hours. Hubify must retain its strict normalization,
permanent DB claims, merchant/account scope, pagination/leases and conservative
unknown/refund handling. Do not vendor or run the reference service as-is.

Existing Hubify independent QRIS functionality validates static TLV/CRC,
merchant templates, IDR/country/no-amount and unsupported fee fields, constructs
dynamic amount/CRC locally and generates PNG locally. Draft merchant settings
persist per installation; no external QR image service is used. These facts do
not establish a connected GoPay merchant, background polling or paid checkout.

Readable source: https://github.com/ahmadzakiyox/gopay-api-gateaway/blob/2f9444e/server.js

## blu and OAuth: actual remaining work

blu's original format, issued amount/window matching, encrypted OAuth and
domain/full-body signature verification are proven for the enrolled Hubify
admin. Source observations still have no stable bank transaction identifier
and provider status UNKNOWN. A valid email signature must not be silently
promoted into a settled bank transaction. Unknown, late, duplicate or ambiguous
evidence remains manual review. No second transfer can resolve this contract
gap by itself; do not ask the owner to repeat the already successful transfer.

The paid-checkout method, continuous per-source worker, source opt-in migration,
atomic settlement/lifecycle integration and reviewed manual-resolution flow
are not implemented. The existing schema intentionally CHECKs enabled=false.
Do not edit that historical migration; any future activation needs append-only
SQL plus a new exact updater profile and database/stock/order concurrency tests.
Do not present the new schema32 executor as permission for that activation.

Each isolated store currently needs its own registered Google Web client and
exact callback, operator-held client secret/encryption key and a seller consent.
The Hubify Google project was External/Testing at the last verified console
check. Public distribution has not been verified anew and is not claimed.
gmail.readonly is a restricted mailbox-wide scope; query filters do not reduce
the permission. External Testing with Gmail scope normally gives refresh tokens
a seven-day lifetime. Publishing a Git release does not change Google state.
Self-managed per-store clients do not by themselves establish a blanket
verification exemption or readiness for all sellers.

Authoritative requirements:
https://developers.google.com/workspace/gmail/api/auth/scopes
https://developers.google.com/identity/protocols/oauth2
https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

## Release/recovery decision

**Limited existing Hubify observation pilot remains available; public payment
release is NO-GO.** General release authorization already exists and must not
be requested again. The outstanding work is technical/protocol/distribution,
not another owner transfer or generic permission.

Keep backup20261114-131849-5ed9b428, prior app image, private configuration and
encryption key together. A code rollback must preserve current database,
observations, claims and new orders. Never restore an old database automatically
after traffic has reopened. No J&T create/cancel/pickup operation is a smoke test.
