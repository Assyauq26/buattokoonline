# Historical prototype checkpoint — superseded

This records the initial PR implementation only. See
[the current release review](updater-migration-review.md) for the registered
executor, worker v3 distribution and actual Linux/browser/reboot evidence.

## Safe updater migrations — initial checkpoint, 13 November 2026

Decision: **BLOCKED for deployment, worker installation and catalog publication**.
This Draft PR implements discovery, a detached-policy verifier, an operator worker
replacement tool and a forward-only orchestration contract. It does **not** enable
one-click v1.8.0 migration. The native multi-installation adapter, Linux lifecycle
rehearsal and pilot remain required. No production apply path calls the new
orchestrator or policy verifier. Worker VERSION remains 2 deliberately.

## Observed baseline and boundaries

- Base main `e5b6764e90ec2071f19518bc3020a6caeed9badd`; isolated branch
  `codex/safe-updater-migrations`, no changes to other worktrees. Open PRs at
  inspection: #38 identity sync, #37 product motion, #3 earlier update dashboard.
- GitHub v1.8.0 remains published, source/tag `7e81f8e60b27ab5695ac50ac6b653b63095e36d1`.
  Asset `store-v1.8.0.tar.gz`, 4,398,817 bytes, SHA256
  `2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`.
  SHA256SUMS asset digest `987c91aa0c9bd6c022d1d626d9bb772e3bce906414adbfb21c55cf70a5dcc9e5`.
  None of these assets/tags or the release policy were modified.
- Fresh read-only SSH to Hubify returned installed 1.8.0, source 7e81f8e,
  30 migrations, pilot channel, installed engine SHA256
  `7e692a17a361d4acc8377fb3d751a032385a977a259ff016567b8e72aa6f8236`.
  This does not establish the state of another seller or VPS.
- Fresh public catalog fetch: sequence 5, expiresAt 1794627899, versions
  1.7.0, 1.7.2, 1.7.3, 1.7.4. v1.8.0 is absent. No catalog was published.
  The preceding investigation verified its Ed25519 signature; that previous
  verification is not substituted for authentication at future apply time.
- Gheverhan direct SSH previously failed strict host-key validation. No new
  host key was accepted and no current Gheverhan ledger/runtime is asserted.

## Audit of existing execution

`server.Controller` authenticates admin identity, session revocation and a
root-owned control token over Unix socket. Read-only polling uses expiring,
hashed status capabilities; Caddy never exposes the command socket.
`State` serializes jobs in SQLite WAL/FULL transactions, persists idempotency,
catalog sequence, events and recovery states. `Engine.process` owns the shared
operation lock, verifies runtime origin, baseline inventory, ledger, resources,
signed catalog, GitHub artifact bytes, manifest, and installation ranges.

The existing worker only supports `rollbackCompatible:true`; it can restart old
code after verified completed migrations, so it must NOT execute v1.8.0. Its
timer drain + app stop is not sufficient proof of a general ingress/carrier
fence. The Hubify-only `promotions_cutover.Native` separately checks carrier
ambiguity, fences traffic, verifies scratch restore and protects write reopening.
Its pinned Hubify identity and EOL rules are NOT a reusable fleet exception.

App updates never replace root worker code. New installs use bootstrap/activate;
existing bootstrap returns the existing config rather than upgrading a worker.
This PR adds a separate root operator replacement path; no reinstall/seed/reset.

## Discovery and seller UI

Discovery now reports current/available/blocked/check_required independently of
execution eligibility. A newer incompatible signed-catalog release remains
visible with worker/path/DB/migration reason. An old worker's filtered null
release no longer produces a false current message in the new dashboard.
Absence from the signed catalog still cannot be interpreted as knowledge of
all GitHub releases. Publishing informational metadata remains an operator task.

`upgrade_path` uses only nonrevoked, channel-compatible published edges and exact
source ranges. For supported rollback-safe multi-hop paths only the next edge
is offered; each step must pass fresh preflight and signature/revocation checks.
No false-rollback-compatible edge is traversed.

| Before | After | Why |
| --- | --- | --- |
| Filtered null release claimed current | Explicit discovery or old-worker explanation | Avoid misleading sellers |
| Incompatible newer version disappeared | Version, reason and next operator action | Make blocked states actionable |
| Latest target could hide a required predecessor | Offer the next supported signed edge | Prevent unsupported skips |

## Detached policy contract

`upgrade_policy.authenticate` verifies Ed25519 over exact payload bytes using
operator-installed public roots. Format 1 binds repository, policy id/sequence,
issuedAt/expiresAt (maximum seven days), exact from/to versions, artifact digest,
source SHA, baseline app tree, minimum worker, before/after migration inventories,
executor identifier and `forward-only-after-migration` strategy. Unknown fields,
changed historical hashes, expired/future metadata and unknown keys fail closed.
`bind` checks these identities against actual release/baseline/ledger. `State.policy`
rejects sequence replay/equivocation durably after authentication.

This is a proposed **separate** policy feed; it does not modify format-2 catalogs
or v1.8.0 release.json. There is no production policy endpoint/publisher wiring
yet. Catalog sequence and policy sequence are distinct. Old workers continue
rejecting the incompatible artifact. No `rollback_compatible` override exists.

A GitHub digest or Git blob SHA proves consistency, not independent authority.
Production signing must use the existing root-only isolated signer infrastructure
after review, with a separately scoped upgrade-policy key. Private keys must not
be available in the app, catalog-serving container, artifact or repository.
Tests generate disposable local keys in temporary directories, never production
keys. An operator must authenticate the initial public bundle out of band.
Rotation requires an operator-reviewed root bundle with overlap, independent
fingerprint verification, then removal of revoked keys. Verification must occur
again at start/recovery; a cached policy cannot authorize apply after expiry or
revocation. A production rotation/revocation ceremony is not proven by these tests.

## One-time worker upgrade (operator only, not approved to run)

From an operator-authenticated, reviewed **full Git SHA** and clean LF checkout:

```sh
cd /opt/reviewed-updater-source/installer
sudo python3 -m update_service.worker_upgrade --source /opt/reviewed-updater-source --sha FULL_REVIEWED_SHA
# After separate approval and Linux rehearsal only:
sudo python3 -m update_service.worker_upgrade --source /opt/reviewed-updater-source --sha FULL_REVIEWED_SHA --apply
```

The tool compares every copied Python file with Git blobs, accepts only installed
worker v2, rejects symlinked destination ancestors, checks SQLite read-only for
all active/queued/recovery jobs, holds the existing shared lock, stages files with
fsync, records durable switch intent, stops only updater, switches the directory,
and requires active systemd plus a responding authenticated-status surface.
401 without a status capability is the expected health response, not a bypass.
Old directory is retained; a failed completed switch restores the old worker.
No config/token/trust/root manager/app image/database/media is replaced.

The first worker receives this change through an operator, not seller self-update.
The source SHA is operator-authenticated; the replacement bundle is NOT claimed
independently signed. Unknown worker versions require a separate reviewed path.
Power loss between the two directory renames can leave the worker unavailable;
its journal and previous directory require operator reconciliation. Do not clear
the journal or rerun blindly. Restoring the unchanged previous **worker directory**
before app migration is different from restoring a database. Linux power-loss,
mount ownership, health failure and switch recovery are mandatory pilot blockers.

## Forward-only transaction boundary

`ForwardCutover` is an unregistered orchestration contract. The native caller
must hold the shared lock, persist driver journals with fsync, and bind policy,
installation, manifest and actual ledger. Ordered stages: preflight, build,
recheck, drain, fence, backup+isolated restore verification, migration, ledger
verification, activation, readiness, metadata, traffic open, worker resume.
Intent is saved BEFORE daemon operations. The traffic-may-have-opened bit is
saved before opening. Neither apply nor reconcile automatically restores DB.

Recovery rules:

- Before migration intent, after proving daemon work stopped and schema still
  old: old application may be restored, workers resumed, fence removed.
- SQL intent with old/partial/unknown ledger: preserve fence, operator diagnosis;
  never replay SQL or resolve/modify Prisma history to get a green result.
- Complete new ledger, traffic never opened: verify migration and activate
  candidate forward; never restart the incompatible old binary.
- Traffic may have opened: only adopt a verified healthy candidate on complete
  new schema. Otherwise keep recovery required; no old-code or DB restore.
- A Docker client failure does not prove daemon work stopped. Reconcile requires
  explicit driver proof of external-work termination and matching identity.

The native fleet adapter must still establish a durable ingress fence for
checkout, payments and webhooks (including delayed/replayed events), stop new
scheduler/cron work, drain in-flight carrier operations without killing or
duplicating them, and verify readiness while writes remain fenced. It must leave
J&T flags/credentials unchanged and refuse unknown carrier outcomes. Tests of
this contract cannot establish that proxy/queue/provider behavior on a real VPS.

## Tests and limitations

Executed locally on Windows, Node 22.23.4, disposable test signing keys:

| Check | Result | Scope |
| --- | --- | --- |
| `python -m unittest discover -s tests -p 'updater*_test.py'` | 60 PASS | Existing updater and new contracts; no production mutation |
| `node scripts/run-tests.mjs run tests/unit/updater-availability.test.ts` | 4 PASS | jsdom UI behavior, not browser layout |
| Prisma generate + `tsc --noEmit` | PASS | Isolated worktree dependencies |
| Next production build | PASS | Existing Tailwind ambiguous-class warning; no new build failure |
| `git diff --check` | PASS | Whitespace |
| Historical migration diff vs base main | Empty | No SQL/schema/version/policy/tag changes |

No CI was requested or dispatched. Commit/PR use `[skip ci]` because the
management workflow otherwise subscribes to PR events. No workflow was weakened.

- Local Python updater suite covers signature/tampering/revoked-key/expiry,
  baseline/artifact/worker/ledger binding, persistent replay/equivocation,
  discovery, source inventory tampering, active-job replacement refusal, and
  simulated failures across all orchestration phases and forward reconciliation.
- Four jsdom UI tests cover blocked, old-worker, explicit current, catalog failure.
- Existing PostgreSQL migration rehearsal and deployed v1.8.0 evidence remain
  relevant to the unchanged SQL, but are NOT evidence of this new generic adapter.
- No historical SQL or ledger changed; no migration was run in production.
- Worker replacement switch/rollback, actual reboot, real webhook/J&T draining,
  restore, native application cutover and 390/1440 browser pilot have NOT been
  proven for the new path. No production private signing key was used.

## Required next gates and pilot

1. Implement/register a native fleet adapter only after independent review of
   the above drain/fence/recovery invariants. Wire verified policy fetch + durable
   anti-replay + executor capability checks into start/reconcile, not the browser.
2. Rehearse worker replacement and every power-loss phase on an isolated Linux
   copy; restore media/config/DB to a separate target and compare data/ledger.
   Use the immutable v1.7.4 and v1.8.0 artifacts, not a rebuilt substitute.
3. Obtain a fresh read-only pilot baseline including all files/ledger, runtime,
   capacity, proxy/worker/queue/carrier state. No global EOL exception; unexpected
   checksums stop upgrade. Verify Gheverhan host identity independently if selected.
4. Review signing/publication authority, worker package identity, root rotation,
   explicit pilot installation allowlist and expiry. Keep automatic update start
   disabled; availability expansion does not authorize forced tenant updates.
5. After separate approval, install reviewed worker on one pilot, verify health,
   publish signed pilot-only metadata, let its admin initiate Update sekarang.
   Observe read-only health, product/order/account and promotion flows; no real
   payment, AWB, pickup/cancellation or active catalog promotion for testing.
6. Any unknown daemon/carrier result, integrity mismatch, missing backup,
   readiness/runtime/version mismatch or runtime-error spike stops expansion.
   Revoke the new policy/release through a higher signed sequence, retain jobs,
   fence affected pilot and use the phase-specific recovery rules above.

Until these gates pass: no merge, no worker installation, no catalog publication,
no deployment and no claim of availability to all sellers. This is a checkpoint
for review, not a completed fleet updater implementation.
