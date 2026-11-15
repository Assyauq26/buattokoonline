# v1.8.2 — blu checkout and reviewed bank notifications

Status: candidate; this file records gates, not a claim of live deployment.
Owner authorizes PR56 merge, Hubify deployment and publication after gates.
No fleet installation or shared bank/OAuth credential distribution is authorized.

## Seller changes

- Connect the receiving blu account to its Gmail notification inbox in Settings →
  Payment methods → Bank notifications through Gmail. Read a notification, then
  explicitly enable that connection for checkout. Disconnect/reconnect revokes
  checkout availability and fences in-flight readers.
- Buyers choose blu, accept the Rp1–Rp999 additional unique code, and receive
  exact transfer instructions, a ten-minute deadline, copy buttons and status.
  The base total must be at least Rp10,000. Existing manual transfer remains.
- The maintenance worker reads Gmail without an open buyer tab, with durable
  pagination, leases, generation checks, request deadlines, backoff and reconnect.
- Signature-verified amount/time matches with uncertain bank status go to
  seller review. This is not proof of payer identity. Financial staff confirm
  the original bank mutation before approving once, in the same transaction as
  the permanent evidence claim, stock commit, history and notification.
- Ambiguous/late/refund/unmatched evidence supports durable review notes and
  never revives an expired order or silently issues a refund.
- QRIS validation/local image generation and draft settings remain available;
  GoPay login, refresh, transaction reader and checkout remain **disabled**.
  Historical readable OTP code is not evidence of current service support.

## UI review

| Before | After |
| --- | --- |
| Only an isolated test transfer | Real order instructions with disclosed unique code and deadline |
| Browser-triggered inbox read | Backend worker, independent of browser lifecycle |
| Candidate with no completion path | Permission-checked bank confirmation, audit notes and permanent claim |
| Operator setup unclear | Per-installation private client provisioning and precise callback |

Buttons are monochrome, have visible keyboard focus and usable touch targets.
Buyer polling is bounded, pauses in hidden tabs and aborts on unmount. No OAuth
secret, inbox payload or refresh token is sent to client component props.

## Migration / compatibility

Public source is **v1.8.1**, commit
`0a4e16c2e4590c7a7413f07ff71b7523824b294d`, immutable archive SHA256
`483e43b4e2e72fe5b8d5aa35273e153760fb792f2bbb6a4049a26c5311665efc`.
Canonical31 → evidence32 → blu33 uses `blu-checkout-forward-v1`, installed via
the reviewed worker operator upgrade and separately signed artifact-bound policy.
Older workers reject the executor and show the operator action; protocol3 alone
does not promise that every installed revision supports it. Other source
versions follow only already published compatible predecessor edges.

Migration33 adds nullable `automationActorId` and replaces the disabled-only
source constraint with a blu-only, connected-bank/secret/actor opt-in constraint.
All accounts remain disabled after SQL. No order, price, promotion, stock, quota
or historical migration row is updated. SQL lock timeout10s, statement timeout90s;
small source-table ALTER requires a brief exclusive lock. No giant backfill.
After-schema: `f2c74e00885d943c8491f4de00a6ebdbf295c6016095f3b049878320ece9d075`.
Historical32 checksums remain immutable. The canonical32→33 rehearsal preserved
all87 existing table projections and every historical ledger row.

Hubify has its own private32 baseline8e65f4a, artifact376d677b… and image4f4618…
plus two previously proven legacy CRLF ledger hashes. The separate official
`deploy/hubify-blu-checkout-cutover.py` binds that exact installation/source,
archive, image, full source bytes, schema, ledger and byte-equivalence proofs.
It preserves the old SQL/ledger; it does not relabel the pilot as public31.

## Per-domain OAuth distribution

Each installation supplies its own Google Web client JSON privately on its VPS,
mode0600, with callback `https://ITS-DOMAIN/api/v1/admin/payment-evidence/oauth/callback`.
Enable Gmail API, declare only `gmail.readonly`, add the inbox as a Test user
while External/Testing, then obtain owner consent directly in the dashboard.
Run `python3 installer/blu_oauth.py --client-json /root/CLIENT.json --admin ID`
to inspect, and with `--apply` under the operation lock to stage private config.
It never rotates an existing key, restarts an app, or activates a payment source;
existing pilot configuration requires its pinned transition. Recreate the app
through the installation's official operator path to load staged env settings.
Back up the new encryption key privately with configuration before connecting.

Hubify's existing client/token remains private. Public artifacts contain no
client secret or token. Google External/Testing still restricts users and can
expire refresh authorization after seven days. Broader distribution requires
each client's applicable consent-screen publication, restricted-scope review /
verification or a documented Google exemption; never promise universal access.
See [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
and [restricted-scope requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Deployment and recovery gates

1. Freeze final merged source; package with `installer/release.py`. Verify manifest,
   source Git blobs, migration inventory, digest and immutable v1.8.2 tag availability.
2. Rehearse public31→33 in the existing dedicated Linux lab, with its own DB,
   media, internal networks, loopback services, signing key and disposable timer.
   Never migrate/reset the existing QA shop to simulate failure.
3. Check Hubify identity, baseline, schema/ledger, no carrier request in flight,
   all J&T approvals unchanged, idle updater, lock and disk. Preserve every old
   receipt. Only authenticated unused build cache may be removed, without force.
4. Use the official bounded Engine build on Hubify when the6GiB build and memory gates pass, or an independently authenticated builder when they do not.
   Bind the root-only prepared-image receipt to final Git/app tree/archive digest
   and both immutable image IDs; verify every packaged runtime source file in
   isolated read-only, unprivileged, network-disabled image inspections. Reserve
   the existing2GiB plus twice persistent data budget only after images exist.
5. Official cutover rechecks after build, drains maintenance/updater, preserves
   all proxy sites, fences ingress and stops app writers before consistent
   DB/media/config backup and scratch restore verification. Save durable intent
   before migration, activation, readiness, metadata and traffic opening.
6. Verify schema33, unchanged old ledger/data, no silent account activation,
   runtime image/source/version, private configuration, J&T guards, health and
   admin/customer/storefront/manual-transfer pages. Resume workers deliberately.
7. Only after smoke succeeds create immutable tag/release/assets/checksum and
   signed catalog policy for eligible sources. Never auto-install other shops.

Before SQL intent, rollback may restore the preserved app/Compose and traffic
only with unchanged old ledger. After migration, use forward activation/recovery;
`rollback_compatible=false`. Partial31→32→33 ledger remains fenced for operator
review, never guessed/replayed SQL. If a client dies during build/backup/migrate,
prove external Docker work stopped before explicit reconciliation.

Code rollback and database restore are different. Never automatically restore an
old DB after traffic may have opened or new orders may exist. Preserve current
data; reconcile healthy33 candidate and writes first. A manually authorized
disaster restore needs a write fence, current safety backup, transaction recovery
plan and verified DB/media/config match. PostgreSQL restore can deparse four
equivalent varchar CHECK expressions differently; lab-only authenticated fixture
normalization is not production schema acceptance or permission to edit ledger.

Rollback triggers: readiness/source mismatch, schema/history drift, runtime
errors, unexpected payment activation, worker failure, proxy site loss or changed
J&T flags. Keep the fence and stage-specific root journal when safety is uncertain.

## Evidence to complete before publication

- [x] App production build/typecheck; payment unit and real isolated-DB tests.
- [x] Canonical32→33 data/ledger preservation and default-disabled activation.
- [x] Linux updater unit regression including signatures and restrictive guards.
- [x] Isolated Docker31→33 upgrade and migration_done crash/forward recovery; all81 baseline tables and31 old ledger rows unchanged.
- [ ] Final exact artifact, private32→33 rehearsal and Hubify smoke.
- [ ] Merge/tag/release/catalog identity verified after deployment.

No new bank transfer, payment approval, resi, pickup or J&T cancellation is used
as an automated smoke test. The owner tests real checkout after deployment.

## Executed candidate evidence

[Public upgrade/recovery](evidence/blu-v182/public-upgrade-recovery.json),
[canonical32→33](evidence/blu-v182/canonical32to33.json), and
[backup restore](evidence/blu-v182/backup-restore.json) are machine-produced
receipts without bank credentials or customer payload. The public lab compiled
source2d28fff, app tree`d075b1850ed1d26197c1990a9d07881ae2237b4b`.
It upgraded representative pending/paid order snapshots, SKU/inventory, coupon
and history data. A real SIGKILL after SQL committed left the fence and old app
stopped; official reconciliation activated33 without replaying SQL or restoring
an old DB. The fixture timer resumed and all81 old table hashes matched.

The original1280MiB build cgroup hit an actual typecheck OOM (exit137); the
failed pre-SQL attempt reconciled to the unchanged31-migration app. The reviewed
1792MiB/3072MiB memory+swap build succeeded. Fresh builds now require at least
2600MiB free memory+swap; prepared-image readiness retains the separate existing
budget. No resource guard is disabled. A durable reconciliation checkpoint also
proved that order51 is processed after a bounded50-order batch and restart.

The catalog continuation is separately reviewed in platform PR16. It preserves
the old approval and requires the exact merged seller source/artifact plus a
separate root-owned1.8.2 approval. Policy signing uses the existing networkless
runtime; the central app/database are not deployed. Its real-archive test uses a
disposable Ed25519 key, and tests verify refresh, global sequence monotonicity,
wrong-artifact rejection and explicit wildcard review. Publication still follows
successful Hubify cutover and smoke; these lab receipts do not claim it is live.


## Production preparation / capacity

The candidate OCI layers were measured without extracting them:1,004,016,863
compressed bytes and3,295,343,616 uncompressed bytes. Compressed image size alone
is not an import budget. The laptop-relayed image stream was stopped before any
app cutover, and unchanged container/source metadata was verified. An attempted
internal SSH route failed the existing trusted host-key check; it was not trusted
or used. Its temporary forced-command key was removed and the original authorized
keys restored byte-for-byte; the source private key and pin were deleted.

Only specifically authenticated obsolete store app/tools images and unused build
cache were retired, without force/prune. Current/immediate-predecessor app images,
current tools, database/media/configuration, every backup and central platform/mail
images were retained. The old1.7.4 image's only differences were the two already
proven CRLF representations; no historical file or ledger was edited.

An extra1GiB private swap file was added on Hubify after the original build/disk
budget passed, preserving the existing swap. The original fstab and a capacity
journal are root-only under`/var/backups/single-store/blu-build-capacity-20261115`.
The resource gate passed and free disk remained7,180,648,448 bytes before final
prebuild. Final factory images can therefore be built locally by the official
Engine, then independently checked and supplied to the cutover as prepared
images. This is an image-preparation stage, not an app/schema activation; the
normal checksum/baseline/backup/migration/fence/recovery gates still follow.
