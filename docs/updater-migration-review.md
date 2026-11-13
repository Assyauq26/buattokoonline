# Updater v3 release review — 13 November 2026

Draft PR #52 now wires the actual verified migration executor into the worker.
The initial prototype checkpoint is retained separately in
[updater-migration-review-initial.md](updater-migration-review-initial.md); its
unregistered-executor/worker-v2 statements describe that earlier commit only.
This document and the evidence below supersede those implementation statements.

The earlier checkpoint covered implementation and isolated verification. The
owner's follow-up now explicitly authorizes review, merge, central distribution
configuration, a controlled pilot and release after safety gates pass. This does
not authorize fleet app updates or changes to published v1.8.0 bytes. The original
distribution decision below records that previous checkpoint; subsequent rollout
receipts must state actual catalog, pilot and production changes separately.

The follow-up adds a disposable empty-baseline factory to the existing Linux lab:
official v1.7.4 migrations/bootstrap in a new database, distinct image names and
internal networks, followed by real public-catalog transport. It does not clone
or downgrade the reset QA store's current v1.8.0 database. Test transport patches
are omitted only when `officialCatalog` is explicitly enabled. The fresh QA app
and frozen worker source remain unchanged.

## Baseline and immutable application release

- Base main: `e5b6764e90ec2071f19518bc3020a6caeed9badd`.
- Worker implementation exercised in the native browser/reboot lab:
  `51a29da04d429a645be868a2abccf159a5dd62e4`.
- The first fresh rehearsal automatically installed worker source
  `4fe334c16657ef6ee9facfa8b20574b64037e803`. Runtime lifecycle/identity fixes
  are recorded at `576ead12b48c6eb6285d9c3180ca034ca4d72a13` and final follow-up.
- Final worker code freeze and active QA source:
  `1239bec7b8c769810841a4aeb8f719e4770db8fa`, 35 Python files verified against
  pinned Git and the completed receipt. Later documentation-only commits do not
  change these worker bytes. The real v3 revision used the official atomic helper;
  prior completed receipt/code and reversible route snapshots were preserved.
- Published v1.8.0 app source: `7e81f8e60b27ab5695ac50ac6b653b63095e36d1`.
  Archive 4,398,817 bytes, SHA256
  `2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`.
- Canonical v1.7.4 source: `c3cfb22fb03bc3bea37aadfb6d790c75e805d51b`;
  archive SHA256 `0a286296c0c85e5e320f85043e85dede0213e013dae129351a374df35f586b4e`.
- v1.7.3 source: `b8b33ebecec3f1c9798b7148f0f407da142afb46`;
  archive SHA256 `78ad297baa8f76225ab8ef649fc05a72bd45bd6a88ede9ffd18420bf4e121cd0`.
- No historical migration, Prisma ledger, application VERSION, published artifact,
  release policy or workflow was changed. The forward release remains
  `rollback_compatible: false`. Worker v3 is distributed separately.
- Public catalog observation: sequence 5, expiresAt 1794627899; versions 1.7.0,
  1.7.2, 1.7.3, 1.7.4, with no v1.8.0. That explains why refreshing a seller's
  old update screen cannot discover v1.8.0. Catalog expiry/publication must be
  checked afresh by its owner before rollout.

## Execution authority and supported profile

Discovery exposes installed/latest versions and precise blocked states without
granting execution. Only signed, unrevoked, channel-compatible catalog entries
are considered. A proven predecessor can be offered without promising that a
future forward baseline is eligible; the seller checks again after each step.

The format-2 detached Ed25519 policy is carried inside the existing signed
catalog's `upgradePolicy`. It binds exact source/artifact, from-source, app-tree,
all baseline runtime file hashes, canonical schema hash, before/after migration
inventories, worker minimum, executor, failure strategy, sequence, expiry and
installation cohort. Persistent catalog and policy replay/equivocation checks
remain enabled. Worker v2 continues rejecting the forward release.

The native forward adapter supports the canonical v1.7.4 -> published v1.8.0
profile on PostgreSQL 16, database contract 1, manual payment provider, reviewed
proxy and idle carrier operations. It checks actual running source/image/env,
complete 29-row ledger, schema fingerprint
`7bf82245b86cd80c7a1d38aa374538210ff19df871548da773549785de448ef1`,
capacity and immutable configuration before downtime. SQL adds only
`20261112050000_promotion_sku_offers`, SHA256
`0b43da5d78a6c9211c4fef32bf8d5a813e2e335992035f8923db64f50a35b2f7`.
Unsupported schema/history/customizations stay blocked; there is no broad
line-ending normalization or fabricated ledger exception.

Fresh authentication occurs at start, execution and reconciliation. Metadata is
data, never shell commands. The global operation lock prevents concurrent
cutovers. Unknown Docker outcomes leave an external-work marker and require
operator inspection. No HTTP endpoint exposes root update commands: start/check
retain app Admin, CSRF, installation and private control-token/socket checks.

## Transaction boundary and recovery

The real Engine now runs NativeForward through durable ForwardCutover stages:
build -> recheck -> stop cron intake/wait current work -> fence ingress -> wait
HTTP/outbound sockets and carrier idle -> stop app -> verify no writers ->
DB/media/config backup and scratch restore -> SQL -> full ledger/data verification
-> private activation/readiness -> metadata -> traffic open -> cron resume.

Every existing public table is hashed inside PostgreSQL; row payloads and customer
or configuration secrets do not leave the DB. Verification ignores only the new
fields' expected defaults and new empty offer table. All 29 historical ledger
rows, including IDs/timestamps/logs, must remain identical before opening.
The traffic-may-have-opened bit is persisted before proxy opening. Proxy updates
use no-deps/no-build/pull-never and cannot implicitly restart old incompatible code.

Before SQL intent, proven old schema and stopped external work permit code
rollback. After complete new schema, recovery proceeds forward without replaying
SQL. Partial/unknown outcomes remain fenced. Once traffic may have opened, only
a verified healthy new candidate may be adopted; the old backup is never
automatically restored. See the executable operator steps in
[updater-worker-v3-runbook.md](updater-worker-v3-runbook.md).

J&T PREPARED/DISPATCHED/UNKNOWN work blocks cutover. No carrier request is retried
to make a test pass; all three production approval/create flags are immutable
through the journal. Existing payment/provider webhook code acknowledges/logs
events rather than providing a proven durable replay queue. Automatic payment
providers therefore remain explicitly unsupported for this migration profile.
Tests do not claim real AWB/payment/pickup/cancellation verification.

## Worker and seller UI distribution

Existing installations receive one root/operator worker upgrade from a pinned,
reviewed Git checkout. Inventory checks exact bytes and secure paths; a shared
lock, idle-job checks, Linux atomic directory exchange, service/socket health,
before/after receipts and bounded rollback/recovery protect the installation.
It also adds the independently authenticated updater HTML/status routes to the
correct Caddy site, preserving sibling domains and reversible config snapshots.

The black/white dashboard displays versions, eligibility/reasons, download/stage,
history and recovery reference. A real Admin cookie is checked against JWT
issuer/audience/signature, session version and `sha256(jti)` revocation state.
Cookie-authenticated read-only polling survives app maintenance and page closure.
Release notes use textContent, nonce CSP, no-store and frame/referrer restrictions.

For an empty new server, the pinned fresh-worker entry point authenticates the
immutable v1.8.0 artifact/source and arms one-time worker installation after the
original wizard's completion/activation receipts. It refuses any existing store
paths. The full original wizard was exercised on the user-reset Ubuntu 24.04
server using real public DNS/HTTPS, real build/bootstrap, automatic worker v3,
actual seller login, dashboard and mobile/desktop status checks.

That rehearsal exposed two real integration defects: systemd removed the mounted
socket directory during worker restart, and the immutable wizard omitted runtime
STORE_BUILD_SHA. The launcher now preserves runtime directories before the original
unit starts and initializes generated source env before the first build, only
after copied app bytes match the authenticated archive. Existing-worker install
and reconcile also preserve directories and verify the socket from the actual
unprivileged app before/after switching. Already dangling mounts fail shut with
worker_socket_mount_review_required, instead of reporting a successful upgrade.

The first QA rehearsal needed a bounded repair after these findings: 566 runtime
files were authenticated, the same app image was reattached under the existing
drain/fence primitives, and source env was bound only after proof. All 30 full
ledger rows and 80 table projections stayed identical; no migration, bootstrap
rerun or active DB restore occurred. The fixed pre-bootstrap initializer was then
tested against 671 actual files copied by the original wizard, without modifying
the real store configuration. This is an incremental debug/recovery rehearsal,
not a claim of a second uninterrupted fresh bootstrap with the later fixes.

Actual systemd + read-only Docker-bind regression reproduces the old ENOENT and
proves directory inode/socket continuity with the fix. On the real fresh store,
authenticated application control checks pass after both restart and separate
stop/start. Runtime socket mode 0660, app UID/GID and token authentication remain.
The command and status sockets are deliberately distinct: the host health probe
gets unauthenticated 401 from the read-only status socket, while the app-mounted
command socket rejects the read-only GET probe with 404. Real authenticated
control POSTs are verified separately. Anonymous update-page visits now redirect
to the actual `/login?redirectTo=...` route and the real Masuk Seller form; the
browser filled/submitted that form and reached the authenticated updater.

| Before | After |
| --- | --- |
| Old catalog absence or incompatible release could look current | Verified latest version stays visible with explicit blocked reason |
| Forward contract had no production call path | Actual Engine/start/reconcile use authenticated native adapter |
| Root worker remained v2 | Separate atomic worker v3 distribution and recoverable UI route installation |
| App maintenance hid update monitoring | Read-only authenticated worker UI can be reopened during app fencing |
| Future baseline eligibility could be assumed | Install only the current proven next step, then recheck |

## Evidence and limitations

The user designated 43.173.21.197 as dedicated testing and authorized reboot.
Its reset ED25519 host fingerprint was independently supplied through the VPS
console, matched before reconnecting, and pinned in a separate known-hosts file.
The existing QA store was read-only cloned; cutovers target separate private
`/opt/updater-lab/e18a000*` Docker projects with no container egress. No production
signing key was read or used. Synthetic credentials/dumps/keys remain outside Git.

Fixture preparation preserves every data/ledger row. `pg_restore` deparses four
equivalent varchar CHECK predicates with explicit text casts, changing the raw
schema fingerprint. The first lab clone was correctly rejected for that drift.
Subsequent disposable fixture factories recreate those four constraints from
authenticated original SQL before any upgrade. This is isolated fixture setup,
not normalization in the updater, a production repair or a ledger rewrite.

| Check | Evidence/result |
| --- | --- |
| Local updater suite | 96 tests PASS (10 platform skips); final control/status probe correction also passed its 8-test targeted suite |
| Linux final code-freeze suite | 96 tests PASS (3 Node-host-only skips covered locally) |
| Existing React UI unit tests | 4 PASS; build/typecheck previously passed on implementation |
| Real PostgreSQL 16 rehearsal | Published 1.8.0 SQL, upgrade/restore/history/constraint and lock-failure checks PASS |
| Real native Docker cutover, lab case 3 | Full download/build/fence/backup/restore/migration/activation succeeded |
| Actual installed worker v2 -> v3, lab case 4 | Atomic exchange, real systemd/socket health, reversible Caddy UI routes succeeded |
| Actual browser start + VM reboot after SQL, lab case 4 | Forward recovery succeeded; 29 old rows identical, 30 after, 80 table hashes, verified backup |
| Multistep 1.7.3 -> 1.7.4 -> 1.8.0, lab case 5 | Real controller/discovery, download, backup/restore, SQL and activation passed; previously built images reused only after 552/566-file inventory checks |
| Manual checkout after traffic opening, lab case 5 | Actual customer login/cart/shipping quote/server action created a new order; process killed at opening_done; official recovery retained the order and all 80 table projections |
| Enabled J&T flags, lab case 5 | All three flags remained `1` before/after both cutovers and post-opening recovery; no external carrier request |
| SIGKILL after preparation, lab case 6 | Verified old schema; official code rollback retained 1.7.4/29 rows without DB restore |
| Actual backup failure, lab case 7 | Directory obstruction failed before backup spawning; inspected marker/daemon state; official old-code recovery passed |
| SIGKILL at durable SQL intent, lab case 8 | Migration was not started; ambiguous intent correctly refused automatic recovery with migration_uncertain, preserved 29 rows and fence |
| SIGKILL after activation, lab case 9 | Complete new ledger; official recovery succeeded forward to 1.8.0/30 rows |
| Actual UNKNOWN J&T request, lab case 6 | Preflight blocked; start refused without adding a job; unknown state remained unchanged |
| Two late/duplicate J&T HTTP events, lab case 6 | Existing acknowledgement endpoint returned success twice; all 80 projections unchanged; this is not durable webhook processing |
| Reopen UI while app fenced | Recovery visible, new start hidden, then success after official reconciliation |
| Post-recovery smoke | Storefront, login, products, Flash Sale/voucher pages, account and orders: HTTP 200 |
| Mobile/desktop UI | 390/1440 screenshots, no horizontal overflow |
| Full fresh Ubuntu 24.04 QA installation | Official immutable v1.8.0 wizard, real HTTPS, build/bootstrap, automatic v3, seller login/dashboard and HTTP smoke PASS after documented runtime repair |
| Real worker restart / stop-start | Actual authenticated application control API PASS on both; same mounted directory inode |
| Real reviewed v3 -> v3 revision | Official dry-run/apply, exact prior file inventory, archived receipt, atomic switch, existing-route verification and app-mounted control checks PASS |
| Anonymous updater -> actual seller login form | Correct redirect, actual form submission and authenticated dashboard/updater PASS |
| Fresh baseline backup | Verified scratch restore; 0 products, 1 user, 1 identity; media/config extracted |

Sanitized receipts and screenshots are in [evidence/updater-v3](evidence/updater-v3).
The browser harness initially aborted on an 8-second transport timeout during
cutover. It was corrected to tolerate temporary loss and keep private resumable
state outside the repository. Recovery was then independently reopened/tested;
this is recorded as two harness runs, not a falsely uninterrupted browser run.
The case-4 fixture had unset J&T approval flags; the separate case-5 receipt proves
the enabled-flag case. The multistep/fault rehearsals explicitly inventory and
retag already-built matching images; they do not claim new full Docker builds.
Case 4 performed the real native builds. A 29-test policy/orchestration check and
the complete local 84-test suite passed again after the final docstring edit.

The source QA store was checked again before the owner's reset: still 1.7.4/c3cfb22,
all original 29 complete ledger rows identical, original worker active, and only
its original app/db/proxy containers running. Lab containers were stopped while
their private data, backups and journals were retained. The deliberately uncertain
case-8 test was left fenced/stopped rather than falsely reconciled.

The owner subsequently reset that dedicated VM, explicitly authorizing a fresh
installation. Helipod reported the reset succeeded; the new SSH fingerprint was
independently read from its authenticated console and pinned with strict checking.
All three store paths and Docker were absent before installation. Old lab data,
backups and the old QA installation ID were retired by that owner-performed reset.
The retired unsigned policy/inventory are historical specimens only: **do not sign
or publish them**. Current QA ID is `da49e7ab78f5d18e5f3be0e79dd0a0c4`, already
on 1.8.0. Current backup/identity/service receipts are in fresh-final.json.

No CI was dispatched. Commits retain `[skip ci]`; no workflow was disabled.
Actual production stores updated by this follow-up: **0**. Successful lab copies
do not establish eligibility of Gheverhan, Hubify or any other seller installation.

## Decision and remaining distribution gates

**GO for technical review and a controlled pilot candidate on the documented
profiles.** Native migration/recovery, transaction preservation, legacy worker
installation, fresh installation and actual post-restart control are verified.
Unsupported versions/customizations/unknown carrier state remain ineligible.

**NO-GO for unreviewed general distribution or production catalog publication.**
The owner explicitly requested no changes to the central platform. The public
catalog still lists 1.7.4 as its newest entry, so existing sellers will not discover
1.8.0 merely by refreshing. That is a distribution gate, not a claim that the QA
installation is still 1.7.4: its installed app is 1.8.0/7e81f8e and worker is v3.

The remaining owner process is review/merge, a fresh per-installation inventory
for a selected legacy pilot, pinned worker delivery, and owner-signed allowlisted
policy plus a higher signed catalog sequence using the existing signer. Keep
private keys on the signing host; never send secrets through chat. Expand only
after that seller's initiated update and smoke test pass. No tenant update is
started automatically and no other store's state is inferred from this QA server.
