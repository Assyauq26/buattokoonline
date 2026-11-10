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

The OpenWA provider/auth foundation is in the platform branch, remains disabled
and is not installed by this app release. Central number and seller/test recipient
were authorized by the owner; pairing and live send are still outstanding.

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
password/session was changed. A real version update is still pending.

## v1.7.0 pilot artifact

This is a GitHub prerelease and signed **pilot** catalog entry, not a stable/fleet
release or a merge into main. Compatibility is bounded to v1.6.3, DB contract 1,
PostgreSQL 16, worker 2. The source changes introduce no database migration;
reviewed historical newline-only SQL differences are preserved explicitly.
The policy allows code rollback, never automatic database rollback. WhatsApp
is not enabled by this artifact. Fresh-VPS bootstrap remains unverified live.
