# Updater and WhatsApp pilot — implementation record

## Scope and rollout

Branch: `codex/one-click-updater-openwa`, based on the settings candidate
`6c88a069e23e0f9abfbd7b5da3c56631e0979c89` already deployed to Hubify.
The platform counterpart is `codex/updater-openwa-control` in the landing repo.
No fleet update, DNS change, or general WhatsApp activation is authorized here.

## Current implementation

The seller app sends only `status`, `check`, or `start` through a private Unix
socket. Admin identity, session version/revocation, installation identity, CSRF,
payload size and rate limits are checked. A separate root systemd worker owns
the Docker/backup operations. The app does not receive a Docker socket, shell
operation, signing key, or operator credentials.

Jobs, events, idempotency keys, signed-catalog sequence/history and short-lived
hashed status capabilities are persisted in SQLite. The stable Caddy proxy
routes only authenticated read-only status to the private Docker bridge.
This lets the dashboard continue polling while Next.js restarts. An expired
capability is renewed through the authenticated app when it returns; logout or
session revocation invalidates access. Closing the tab does not cancel a job.

Ed25519 verifies the exact catalog bytes against an operator-installed public
root. The signed catalog pins version, commit, artifact digest/size, GitHub asset
URL, installation version range, DB contract, minimum worker version, rollback
compatibility, channel and expiry. Browser input cannot replace these fields.
Download redirects are restricted to GitHub's asset hosts. Catalog publishing
is serialized, monotonic and retains immutable release history/revocations.

The pipeline checks local source inventory, migration checksums, disk/memory,
then downloads/verifies, builds separately, drains scheduled work, stops app
writes, backs up and restores to a scratch database, migrates, activates only the
app, and verifies actual image, version/SHA environment and public readiness.
No automatic database restore occurs. Interrupted external Docker work remains
`recovery_required`; root must inspect it before explicit reconciliation.

Historical CRLF migration compatibility requires exact old/new digest pairs and
byte equality after newline normalization. The authenticated archive remains
unchanged, installed SQL bytes are preserved, and the Prisma ledger is never
rewritten. Unreviewed or semantic SQL differences are rejected.

## Bootstrap

- New installations copy the public trust bundle and worker unit with the
  authenticated installer, verify copied application bytes, derive the actual
  app/proxy bridge, prepare and activate the service before reporting completion.
- Existing installations use `update_service.bootstrap` from an operator-reviewed
  checkout matching their installed SHA. It writes an idempotent plan and rollback
  copies. `update_service.activate` validates Caddy before reloading, adds socket
  mounts to only the app, and checks readiness. Worker upgrades are separate from
  application upgrades; app releases cannot silently replace the root daemon.
- The installer hook has isolated tests, but a real fresh disposable VPS install
  has not yet been exercised in this milestone. Do not claim fleet readiness.

## Operator recovery

The bootstrap retains `/etc/single-store/updater/compose.before.json` and
`Caddyfile.before`. Activation restores these if its verified cutover fails.
Jobs retain their own original compose pinned to the old image ID, metadata,
source inventory, backup location and candidate inventory.

Use `python3 -m update_service.reconcile JOB_ID` from the installed worker only
after inspecting the journal. `--external-work-stopped` is an explicit operator
attestation after inspecting Docker build/migration and backup activity; it is
not exposed to the dashboard. A running migration or unknown ledger still blocks
reconciliation. Never clear a recovery state merely because the public app works.

## UI review

| Before | After | Why |
| --- | --- | --- |
| Routine update instructions require terminal commands | Check update, review notes, Update now, progress and history | Seller can complete the routine workflow in the dashboard |
| Status depends on the restarting app | Separate read-only status endpoint with revocable capability | Restart does not look like a failed update |
| No operation progress | Backend stages plus download bytes; 100% only after verification | Avoid fabricated timing/success |
| Double-click ambiguity | Client pending guard plus durable server idempotency and single active job | Concurrent admins cannot overlap operations |
| Generic error | Safe actionable messages and explicit operator recovery state | Preserve data when results are uncertain |

The existing Button, theme tokens and settings shell are retained. Local browser
evidence covers 360, 390, 430 and 1440 px, with no horizontal overflow or page
errors. Screenshots and result JSON live in ignored `output/updater-audit/`.

## Verification and limits

Local typecheck/build and targeted Python/browser tests have been run during
implementation. The Python suite exercises signatures, checksums, locks,
idempotence, recovery, socket authorization, migration byte preservation and
mocked pipeline failure states. Browser tests use the real app/auth/local
PostgreSQL but mock worker status. These are not evidence of a real Docker update.

The v1.7.0 updater artifact does not enable WhatsApp. A separate operator pilot
candidate and its live evidence are recorded below.

## Tencent preparation, 2026-11-10

The audited host has 2 vCPU, about 2 GB RAM and 2 GB swap. Operator cleanup removed
1.571 GB of unused build cache older than 24 hours and six obsolete pre-v1.3 cached
store images. Active containers and the current rollback image IDs were checked
and retained. Database volumes, backups, media and running containers were not
deleted. Free disk increased from 4.7 GB to 17 GB; all seven containers remained
running, with existing health checks healthy.

An Ed25519 signing key was created under root-only `/etc/btos-release-signing/`.
Only its public key is bundled in `deploy/updater-trust.json`. No private key was
downloaded, printed, mounted in apps or put in Git.

The c9b9db8 application candidate and independent worker were bootstrapped on
Hubify. Cutover backup `/var/backups/single-store/20261110-094914-40842d30`
passed a scratch restore (4 products, 2 users, 47 media files). The 26 migration
checksums and business table counts were unchanged. Existing DB, proxy, email
relay and unrelated platform containers were preserved during this cutover.

The catalog-only platform commit ea945b4 is active. Initial activation correctly
rolled back when umask made the public catalog directory unreadable to the
unprivileged app. Explicit public-directory permissions corrected that issue;
private signing material remains in a separate root-only directory.

Live HTTPS checks passed: anonymous command rejected, anonymous status rejected,
authenticated status/check returned 200, and revoking the temporary operator
session immediately invalidated its status capability. No existing seller
password/session was changed.

The authenticated Hubify update completed successfully on 2026-11-10, job
`6f174e172254a0b3e74e4160e675e7a9`, from the installed pilot bootstrap to v1.7.0
commit `9ba615254da7408033c154892aed058712f6a35b`. Repeating start returned the
same job. The durable worker downloaded 2,120,895 verified bytes, built the app,
created and verified backup `/var/backups/single-store/20261110-104135-b4a7ac8c`,
ran migrations, activated, and checked actual image/version/public readiness.
All 26 ledger entries, business counts, runtime/Caddy fingerprints, and unrelated
container IDs/start times were unchanged. Temporary operator access was revoked.
Root-only evidence: `/var/lib/single-store/updater-pilot-result.json`.

## v1.7.0 pilot artifact

This is a GitHub prerelease and signed **pilot** catalog entry, not a stable/fleet
release or a merge into main. Compatibility is bounded to v1.6.3, DB contract 1,
PostgreSQL 16, worker 2. The source changes introduce no database migration;
reviewed historical newline-only SQL differences are preserved explicitly.
The policy allows code rollback, never automatic database rollback. WhatsApp
is not enabled by this artifact. Fresh-VPS bootstrap remains unverified live.

## WhatsApp candidate (separate from the v1.7.0 artifact)

Local application checks: production build/typecheck, 34 targeted tests (customer
identity, email registration proof, auth actions, event semantics and durable
outbox), browser checks at 360/390/430/1440. No real WhatsApp delivery is implied.
The central registry UUID is passed as STORE_WHATSAPP_TENANT_ID separately from
the updater installation ID. Only the scoped store token is mounted read-only.
All flags default off. Public admission remains restricted to the authorized pilot
phone at the relay; notification preference and customer consent remain separate.

| Before | After | Why |
| --- | --- | --- |
| No seller connection controls | Private pairing, actual connection status, disconnect | Owners pair their own number without access to the provider dashboard |
| Pale helper copy inherited a surface color | Existing muted foreground text token | Readable contrast while retaining the store theme |
| Ambiguous delivery feedback | Queued/submitted/delivered/read/unknown displayed distinctly | Provider acceptance is not recipient delivery |
| Repeated clicks can overlap | Pending guard; backend lease, dedup and limited retry | Prevent duplicate external submissions |
| No notification consent UI | Separate customer opt-in and revocation | Logging in does not authorize order notifications |

Screenshots: ignored output/whatsapp-audit. The QR fixture is synthetic and is
removed after connection or when the page becomes hidden.

## Hubify WhatsApp activation and live evidence, 2026-11-10

Operator candidate `b4a4ad94f051bcf62ea99c020359f8a68ed0a5c2` is live on Hubify,
separate from the immutable v1.7.0 updater artifact. Additive WhatsApp migration
is applied (27 ledger entries). Backup
`/var/backups/single-store/20261110-125600-36a69812` passed scratch restore;
4 products, 10 orders, 10 payments, 2 users, stock 207/reserved 0 were retained.
Runtime/proxy fingerprints and unrelated containers were preserved at activation.
Linux typecheck and production build passed in separate sequential processes to
fit the bounded builder memory. Runtime Next config retains typecheck enabled.

Public authenticated settings, status/preferences/history, anonymous/foreign-origin
denial, caller session injection rejection and temporary-session revocation passed.
The independent drain timer is active. Both owner-paired numbers are ready and
match their registered expected numbers. Operator central pairing is disabled.

A real incoming challenge initially exposed OpenWA's resolved private-ID format.
Relay fix `e1eac9fc106662729eeea8d2ddc6404341cb9e49` accepts only signed,
engine-resolved phone metadata, never the private ID as a phone. Its 38 tests pass.
The owner received the fresh OTP and completed browser verification: central
challenge/exchange consumed and local challenge verified. New-phone profile/email
completion or existing-account password linking remains required; no identity
was automatically assigned. Full account registration/linking live checks remain
outstanding.

The owner confirmed receipt of `ORD-PILOT-UJI-1794316320482`, sent once with
duplicate enqueue deduplicated. Provider status remains submitted; owner receipt
is separately recorded, never relabeled as provider delivered. No real order,
payment, stock, or shipment was changed for this test. Test consent was revoked
and notification preferences restored to disabled. No general enrollment enabled.

Code-only rollback is recorded by `/etc/single-store/hubify-whatsapp-pilot.json`;
it preserves the additive schema and all business data. Relay rollback is retained
at `/var/backups/btos-platform/whatsapp-lid-1794317211`. The independent updater
baseline was intentionally not rebased to this operator-only candidate; a new
compatible signed artifact is required before promising its next dashboard update.
Fresh-VPS bootstrap and fleet rollout remain unverified/unapproved.
