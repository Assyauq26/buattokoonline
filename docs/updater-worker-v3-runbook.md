# Worker v3 operator runbook

This is a Draft PR #52 procedure, not authorization to install on production or
publish a catalog. It preserves the published v1.8.0 application and all SQL.
Use the reviewed final PR commit as `WORKER_SHA`; do not use a moving branch.
The tested worker code freeze is `1239bec7b8c769810841a4aeb8f719e4770db8fa`;
documentation-only descendants contain the same worker bytes.
Execute one installation at a time. Sellers initiate application updates themselves.

## Existing installation: one operator installation

The old application worker cannot replace its own root-owned code. Obtain a
root-owned checkout at `/opt/store-worker-source`, verify its remote and exact
reviewed commit through the normal repository review process, and leave that
checkout available for recovery. Never run the store bootstrap on this server.

Before installation, inspect the store's installed version/source, actual running
image, complete migration ledger, current catalog/channel, proxy configuration,
disk, memory, current update jobs and carrier work. Resolve any existing recovery
job first. Keep backups and the existing worker. Do not print runtime credentials.

```sh
cd /opt/store-worker-source/installer
sudo python3 -m update_service.worker_upgrade --source /opt/store-worker-source --sha "$WORKER_SHA"
sudo python3 -m update_service.worker_upgrade --source /opt/store-worker-source --sha "$WORKER_SHA" --apply
sudo systemctl is-active single-store-updater.service
```

The first command validates without installing. The second holds the shared
operation lock, checks every worker file against Git, rejects a busy SQLite job
store, records before/after inventories, atomically exchanges directories with
Linux `renameat2`, starts the service, checks its authenticated socket, adds the
two cookie-authenticated read-only UI routes, validates/reloads Caddy, restarts
the worker to load configuration, and checks health again. It preserves sibling
proxy sites. It never changes the application version, app DB or carrier flags.

The durable receipt is `/etc/single-store/updater/worker-upgrade.json`. Its
source SHA and before/after file inventories must match the approved plan.
Failed health restores the old worker and reviewed proxy/config snapshots.
After an interruption, inspect the receipt, root-owned backup directories,
service and proxy before using the same pinned candidate:

```sh
sudo python3 -m update_service.worker_upgrade --source /opt/store-worker-source --sha "$WORKER_SHA" --recover
```

Recovery rejects unrelated proxy/config edits or unrecognized worker contents.
Do not edit the journal to make it pass. While worker installation is incomplete,
the dashboard must not offer a new application update.

The same command supports a reviewed v3 revision only when the previous completed
receipt exists and every current worker byte still matches its after-inventory.
It archives that receipt before preparing the next atomic switch, retains prior
code, and verifies existing UI routes without duplicating them. Unknown v3 roots,
local edits or pending receipts remain refused. Do not delete a receipt to force
a revision installation.

The installer/reconciler also verifies the socket from the actual app container
and installs a scoped `RuntimeDirectoryPreserve=yes` drop-in before stopping the
worker. Preserve that drop-in when recovering the worker; it intentionally also
protects the previous worker after rollback. It changes no socket/token permission.
The reason is documented in [systemd.exec](https://freedesktop.org/software/systemd/man/latest/systemd.exec.html#RuntimeDirectoryPreserve=): stopping a unit otherwise removes its runtime directory and leaves an existing Docker bind attached to the old directory.

If an old worker has already left a dangling app mount, the installer refuses
with `worker_socket_mount_review_required`. Preserving the new directory alone
cannot reattach an old mount. Inspect the actual app/image/source and transaction
state, take a verified backup, drain/fence under an approved maintenance procedure,
then reattach the same verified app image and check the authenticated control API.
Do not restart a busy application merely to clear this error. The bounded
updater_fresh_repair.py test is pinned to the named empty QA rehearsal and is
not a production or fleet repair command.

## New empty server

Use the separately pinned worker entry point and the existing immutable v1.8.0
archive. This command refuses any existing store root, config or data directory.
It authenticates the app archive, checks its bytes against the pinned application
Git worktree, runs the original fresh wizard and installs worker v3 automatically
after the wizard's completion/activation receipts. The one-time timer then stops.
It creates the runtime-preservation policy before the old unit starts and binds
STORE_BUILD_SHA in generated compose configuration before bootstrap, after all
copied app bytes match the authenticated artifact. It refuses an already-started
bootstrap or a conflicting runtime identity rather than relabelling it.

```sh
cd /opt/store-worker-source/installer
sudo python3 -m update_service.fresh_worker_hook start-wizard --source /opt/store-worker-source --sha "$WORKER_SHA" --app-archive /root/releases/store-v1.8.0.tar.gz
```

If the wizard or hook fails, inspect
`/etc/single-store-worker-bootstrap/plan.json` and the
`single-store-worker-v3-bootstrap` service journal. Do not rerun a fresh bootstrap
on a partially initialized store. A completed store uses the existing-store
worker recovery procedure above.

## Detached policy and catalog publication

Production signing/publication is a separate owner action. Neither the worker
installer nor the policy tool publishes metadata. Prepare a one-store allowlist
using that store's actual installation ID, authentic baseline artifacts and a
new policy sequence. Preparation refuses different historical artifact bytes.

```sh
python3 -m update_service.policy_operator prepare --from-archive /root/releases/store-v1.7.4.tar.gz --to-archive /root/releases/store-v1.8.0.tar.gz --installation "$PILOT_INSTALLATION_ID" --sequence "$POLICY_SEQUENCE" --output /root/release-review/v180-policy.json
python3 -m update_service.policy_operator sign --input /root/release-review/v180-policy.json --private-key "$OWNER_KEY_FILE" --key-id "$OWNER_KEY_ID" --output /root/release-review/v180-policy-envelope.json
```

The key must remain on the authorized signing host with mode 0600. Include the
resulting envelope in the v1.8.0 release's `upgradePolicy` property inside the
existing format-2 catalog, keeping `rollbackCompatible: false`, minimum worker
3, installed range exactly 1.7.4, published source
`7e81f8e60b27ab5695ac50ac6b653b63095e36d1`, artifact SHA256
`2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`
and size 4,398,817. Review then sign/publish through the existing platform catalog
signer with a strictly higher catalog sequence; preserve existing release
identities and revocations. Fetch and verify the published envelope independently.
The policy expires after 24 hours by default; reissue before a recovery window
expires without changing its bound source/schema/cohort. Never backdate metadata.

Only after a successful reviewed pilot may an owner deliberately sign
`installations: ["*"]` for general eligibility. That enables discovery for
compatible installations; it does not start updates or replace missing workers.

## Application cutover and recovery

The dashboard must show installed/latest versions and an enabled update button
only after actual read-only preflight passes. Start uses existing app Admin,
CSRF and private control socket checks. Polling and reopening during maintenance
use the worker's independently authenticated read-only route. A revoked/expired
session cannot inspect status or start jobs.

The worker downloads/verifies/builds before downtime, rechecks guards, stops new
cron work, waits for the current maintenance service and HTTP/carrier work,
fences ingress, stops the app, verifies no writers, creates DB/media/config backup
and restores the DB into a scratch database, applies SQL once, checks the full
historical ledger and every existing public table, activates privately, verifies
readiness/image/env, records metadata, opens traffic and resumes cron. It refuses
automatic payment providers whose webhook replay is not proven. Pending or
unknown J&T requests block the cutover; credentials and approval flags survive.

The root job directory contains `forward.json` and, while daemon operations may
still run, `external-work.json`. After an interruption inspect Docker migration,
build and backup work, ledger, service, ingress and carrier state. Then:

```sh
cd /opt/single-store/updater
sudo python3 -m update_service.reconcile "$JOB_ID"
```

Use `--external-work-stopped` only after independently proving those daemon
operations ended. It is an operator attestation, not a bypass for a running
migration. An uncertain carrier outcome must be reconciled with the provider
before resuming; never repeat an AWB/create/cancel request to test the updater.

| Durable boundary | Permitted outcome |
| --- | --- |
| Before SQL intent; complete old ledger; external work stopped | Verify and restore old application code, open traffic, resume cron |
| SQL intent with old/partial/unknown ledger | Keep maintenance/recovery required; inspect actual SQL outcome; no automatic replay or ledger repair |
| Complete new ledger; traffic never opened | Verify preserved data and activate the new application forward |
| Traffic may have opened | Adopt only a verified healthy new application; preserve all new writes |
| Unknown files/proxy/schema/image/daemon result | Keep recovery required and investigate the exact mismatch |

Code rollback and database restore are different operations. No updater path
automatically restores an old database. A separately approved disaster restore
requires a consistent verified backup and a reconciliation plan for orders or
external operations since that backup. Do not discard transactions to obtain a
green health check.
Include `/etc/systemd/system/single-store-updater.service.d/60-store-worker-runtime.conf`
with service configuration backups. Its reviewed content can also be recreated
through the pinned `update_service.service_runtime` helper before starting a
restored worker. The fresh QA baseline backup is local and scratch-restore
verified; it is not a claim of an off-site backup.

## Pilot and fleet accounting

Inventory every installation independently: installed source/version/image,
worker, installation ID/channel, historical hashes, DB schema, custom files,
carrier work, payment provider, proxy and capacity. Unexpected CRLF/LF history,
schema drift or an unsupported version remains ineligible; this implementation
does not normalize historical SQL or rewrite Prisma checksums.

Run one eligible pilot, have its seller press the button, and verify authenticated
desktop/mobile status, storefront/login, products, orders, promotions, readiness,
source/image/digest, ledger, cron and unchanged J&T configuration. Use nonmutating
smoke checks on a real catalog. Stop expansion on any integrity, backup, runtime,
readiness or unknown carrier failure. Revoke eligibility through a higher signed
catalog sequence and use the phase-specific recovery procedure. Record actual
counts of inspected/upgraded stores; a lab copy or one pilot proves no other store.
