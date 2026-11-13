# Updater v3 distribution — 13 November 2026

**RILIS TERBATAS.** This supersedes the previous preparation-only distribution
decision. The owner explicitly authorized merge, distribution configuration,
controlled pilot and release after relevant safety gates. No fleet app update
was requested or started. The published v1.8.0 release was retained unchanged.

## Exact released identities

| Component | Before | After |
| --- | --- | --- |
| Store PR #52 | draft `fbf9c8e` | merged `f2cfab1667e177021a27402ebd87e1417cb022d2` |
| Frozen worker implementation | Hubify worker 2 | worker 3, source `1239bec7b8c769810841a4aeb8f719e4770db8fa`, 35 exact Python files |
| Hubify application | 1.8.0 / `7e81f8e60b27ab5695ac50ac6b653b63095e36d1` | unchanged |
| Hubify app image | `sha256:46543294c7c4c6289f4434bcb904ce7031156149697ec0b3a5a0a4cee0624025` | unchanged |
| Central platform | `ff6c4afa9e0a4b645240606f37cd810eeaca69d0` | `503c82f4986daf42a609fff12e5a337f32b7693d`, platform PR #14 |
| Official signed catalog | sequence 5, latest 1.7.4 | sequence 7, stable 1.8.0; policy sequence 2 |
| Disposable legacy pilot | 1.7.4 / 29 migrations | 1.8.0 / 30 migrations |

Store PR: https://github.com/Assyauq26/buattokoonline/pull/52

Distribution PR: https://github.com/Assyauq26/buattokosendiri-landing/pull/14

Immutable app release: https://github.com/Assyauq26/buattokoonline/releases/tag/v1.8.0

Archive `store-v1.8.0.tar.gz`: **4,398,817 bytes**, SHA256
`2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`.
SHA256SUMS asset digest remains
`987c91aa0c9bd6c022d1d626d9bb772e3bce906414adbfb21c55cf70a5dcc9e5`.
No tag, existing asset, historical SQL, Prisma ledger, app VERSION or false
rollback declaration was edited. The platform merge tree was independently
compared with its tested implementation tree and had no content difference.

## Actual pilot and validation

The new pilot `a1800011` used a separate internal Docker project on the designated
QA VM. Its brand-new database received the official immutable v1.7.4 migrations
and bootstrap; the current QA v1.8.0 database was neither cloned nor downgraded.
Synthetic product/customer/inventory fixtures belonged only to that project.
Its worker was upgraded through the same official dry-run/apply mechanism.

The production public catalog first published sequence 6, pilot channel, with
only that installation ID. The actual browser then performed seller login,
dashboard -> Cek pembaruan -> visible 1.8.0 -> Update sekarang -> succeeded.
Public HTTPS catalog transport and shipped production trust were used without
transport substitution. The native executor built actual candidate images,
drained the test systemd timer/service, fenced ingress, verified scratch restore,
ran migration once, checked private readiness, opened traffic and resumed the
timer. No carrier, payment, pickup or cancellation request was used for testing.

- All original 29 complete ledger rows remain byte-equivalent as JSON; 30 rows
  after migration. All 80 projected table hashes were checked before reopening.
- Independent post-login checks found 78 table projections unchanged. Only
  `AuditLog` and `AuthRateLimit` changed through the login smoke tests. Original
  audit rows, filtered at successful completion, still match the original hash.
  This is not a claim that login generates no operational writes.
- Existing seller/customer login and eight storefront/dashboard/product/
  promotions/account/order GET smoke checks passed; zero browser page errors.
- 390/1440 screenshots passed overflow checks. The root-only backup, data and
  journals remain retained. The disposable pilot services/containers and local
  SSH tunnel were stopped after evidence collection. The original QA app/DB/proxy
  and worker remain running; this is not a permanent staging service. See
  [pilot-stopped.json](evidence/updater-v3/pilot-stopped.json).
- The existing real Gheverhan QA login form and authenticated app control API
  were checked after stable publication: installed/latest 1.8.0, worker 3,
  current state, no unnecessary Update sekarang. The harness explicitly hard
  reloads after React login navigation to exercise the independent worker page
  and matches the `check` response rather than an initial `status` response.
- Relevant local updater suite: 96 tests passed, 10 platform-specific skips;
  existing Linux evidence covers those boundaries. Added platform checks: 14
  Linux package/policy/agent cases, including actual immutable archives and
  Ed25519 signing/sequence refresh; 13 latest-installer resolver cases; source
  build and Linux shell syntax passed. No Actions dispatched.

Sanitized evidence: [public-catalog-pilot.json](evidence/updater-v3/public-catalog-pilot.json),
[public-browser.json](evidence/updater-v3/public-browser.json),
[stable-publication.json](evidence/updater-v3/stable-publication.json),
[production-rollout.json](evidence/updater-v3/production-rollout.json), and
[gheverhan-stable-current.json](evidence/updater-v3/gheverhan-stable-current.json).

## Production changes, backup and recovery

Hubify worker 2 -> 3 used the official operator helper after healthy mounted
socket, idle-job and immutable source checks. A consistent backup scratch restore
verified 11 products, 3 users, 1 store identity, media and configuration. Prior
worker bytes, completed receipt, unit/config tar and reversible UI route snapshots
were retained. The store's app/DB containers did not restart; runtime, migration
environment and version files retained their hashes, including J&T Production
approval flags. No actual shop database migration/cutover occurred in this rollout.

The central platform was deployed with the official exact-SHA activation helper,
retaining its reviewed read-only catalog mount and rejecting unknown overlays.
Its database backup restored into a separate networkless scratch container with
15 tables. The first probe lacked the existing WhatsApp role; recreating public
role names without credentials allowed the complete restore. Source store data
was not changed by that probe. Eight other running containers retained their IDs.
The new served bootstrap agent hash matches the reviewed source. Fresh installs
pin both immutable app and reviewed worker and verify completion; this follow-up
does not claim a second full central enrollment on another newly empty VPS.

The operator publisher uses root-only cohort approval and networkless signing;
the private key stays on the signing host. Both archive inventories, current
trust, full baseline policy and signed result are verified. Minimum worker 3,
exact 1.7.4 range, `rollbackCompatible=false`, J&T guards and forward recovery
remain required. The 5-minute timer refreshes policy before expiry, preserves
history/revocations and advances sequences; a second actual refresh was
idempotent at sequence 7. See the platform's `docs/updater-v3-distribution.md`.

Host free space initially failed the platform helper's 3 GB threshold. Only two
unreferenced obsolete local v1.7.2 pilot image tags and unused >24-hour build cache
were retired under operation/deploy locks. Current/immediate predecessor app and
tools images, databases, volumes, media and backups were retained; free space was
approximately 5 GB after rollout. No broad Docker image/volume/system prune ran.

Private operator receipts are under `/root/updater-v3-production-20261113` on the
authorized central host; worker recovery uses its archived source/receipt and UI
snapshots. Application recovery follows the store runbook: no automatic old-code
activation after uncertain SQL or opened traffic, and no automatic database
restore after new orders. Stop expansion by issuing a higher signed cohort/policy
sequence; never replay an old catalog or disable guards. Platform code rollback
retains the catalog overlay and does not restore its live database.

## Inventory and limits

Central registration has 7 records: 3 localhost fixtures and 4 real domains.
Registration/agent evidence is not fresh worker inventory.

| Domain | Actual verified status | One-button conclusion |
| --- | --- | --- |
| hubify.web.id | app 1.8.0, worker 3; officially upgraded here | Already current; compatible worker ready |
| gheverhan.store | owner-reset dedicated QA, app 1.8.0, worker 3; actual login/check verified | Already current; not evidence of the former production store's upgrade |
| hokira.id | old controller reports v1.7.4; no SSH access/worker inventory available | Unverified; operator inventory/worker upgrade and cohort review required |
| ngirimwa.web.id | registered, no paired agent reported; runtime unknown | Unverified; establish installation and access first |

Stable policy explicitly allows the two verified installations and the controlled
pilot ID only (3 IDs, no wildcard). **The actual one-button 1.7.4 -> 1.8.0 path is
proven for the admitted canonical profile. It is not enabled for every seller.**
Two live named installations have verified v3 workers and are already 1.8.0;
two other registered domains remain unverified. None is asserted compatible just
because its last recorded app version is 1.7.4. Expand only after individual
read-only inventory, official worker provisioning where needed, backup/readiness
and signed cohort approval. Existing enrolled platform agents are not mass-updated.

Residual runtime observation: one Hubify Next.js stream `TypeError` at
09:33:57 UTC, with unchanged app image. Root cause is unconfirmed; it did not
repeat during full-body HTTP 200 checks of home/login/readiness and platform
health, and no uncaught/unhandled marker was present. Do not report zero runtime
errors. The follow-up is log/stream diagnosis if it recurs, not an unreviewed
replacement of the immutable app artifact. See
[full-response-smokes.json](evidence/updater-v3/full-response-smokes.json).
