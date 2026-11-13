# Updater v3 release review — 13 November 2026

Draft PR #52 now wires the actual verified migration executor into the worker.
The initial prototype checkpoint is retained separately in
[updater-migration-review-initial.md](updater-migration-review-initial.md); its
unregistered-executor/worker-v2 statements describe that earlier commit only.
This document and the evidence below supersede those implementation statements.

Scope remains implementation, isolated verification and pilot preparation.
No production worker installation, signed production catalog publication, merge,
public tag/release or fleet deployment was performed in this follow-up.

## Baseline and immutable application release

- Base main: `e5b6764e90ec2071f19518bc3020a6caeed9badd`.
- Worker implementation exercised in the native browser/reboot lab:
  `51a29da04d429a645be868a2abccf159a5dd62e4`.
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
paths. Existing-store installation and crash recovery were exercised on Linux;
the entire original fresh wizard has not yet been exercised in an empty-server
namespace. Unit tests cover wait/disarm/idempotency/refusal, not a fresh-server
deployment claim.

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
| Local updater suite | 84 tests, PASS; 6 Linux-only skips |
| Linux updater suite | 84 tests, PASS; 3 Node-host-only skips covered locally |
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

The source QA store was checked again after the rehearsals: still 1.7.4/c3cfb22,
all original 29 complete ledger rows identical, original worker active, and only
its original app/db/proxy containers running. Lab containers were stopped while
their private data, backups and journals were retained. The deliberately uncertain
case-8 test remains fenced/stopped rather than falsely reconciled.

No CI was dispatched. Commits retain `[skip ci]`; no workflow was disabled.
Actual production stores updated by this follow-up: **0**. Successful lab copies
do not establish eligibility of Gheverhan, Hubify or any other seller installation.

## Remaining release gates

- Complete the full empty-server wizard/hook integration rehearsal or retain an
  explicit new-install rollout restriction until independently verified.
- Refresh final source/PR/checks and immutable tag/artifact/catalog observations.
- Before a production pilot: authorized review/merge, per-installation live
  baseline, pinned worker delivery, owner-signed allowlisted policy plus higher
  signed catalog sequence, and a seller-initiated pilot with nonmutating smoke.

Production/fleet decision remains **NO-GO until those gates are closed**. This is
not a missing-signing-key shortcut: all available implementation and lab work
continues before requesting the owner's final signing/publication action.

The existing-store canonical path has passed the above technical rehearsals;
this is a candidate for reviewed pilot preparation, not a production rollout.
The read-only QA pilot inventory identifies installation
`6b64ce6e38b242488d9d6fb2da7f3450` (43.173.21.197, explicitly dedicated QA).
`qa-pilot-policy-UNSIGNED.json` binds only that ID and both immutable artifacts.
It is an expiring, unsigned review specimen; regenerate from a fresh inventory
and sequence before signing. Do not publish a test key or broaden the cohort.

For an empty-server integration run, another empty Ubuntu 24.04 test host is
needed: the available VM's existing QA store/data are preserved, and neither its
directories nor global services will be replaced to simulate a fresh server.
No production private key is needed for that test. Production signing remains
on its owner's host via the existing signer; secrets must not be sent in chat.
