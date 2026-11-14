# Hubify-only observational pilot executor

Owner authorization: PR #56 may be deployed only to Hubify after safety gates.
No merge, tag, public release/catalog, seller-fleet update or payment activation.
No J&T order/pickup/cancellation test. The Google consent/real transfer remains an
owner action after deployment. The app tree stays the reviewed/tested
`320423e1033751b8a031e664ba661fd11d90b610`.

## Official extension, not a generic exception

`deploy/hubify-payment-evidence-cutover.py` binds the exact open PR #56 head to the
same durable `promotions_cutover.Cutover` state machine used for v1.8.0. The original
adapter still requires merged main and its original target tree. The new adapter
accepts only the pinned Hubify installation, v1.8.0 source/image/artifact, all 566
runtime-file hashes, 30 complete ledger entries, reviewed schema and two known
CRLF/LF representations. Historical files and ledger are never rewritten.

Only the exact order index and six-table evidence migration hashes are accepted.
Generic SQL grammar, staging J&T Production refusal and published artifacts remain
unchanged. The private package uses current VERSION 1.8.1 with its own exact source
and digest and `hubify-development` runtime metadata; it is not published under the
existing public v1.8.1 tag/artifact or to an update feed.

Before applying: authenticate the existing public v1.8.0 package against
`2e15208d27a87a4aeae4446404d45a1f91b55fcc5d28da3714dc064aeeaa9223`,
verify Git/worktree/PR head, and build the private package with `installer/release.py`
from the exact clean source. No downloaded script bypasses these checks.

Example with operator-pinned absolute paths and values (no secrets in arguments):

```sh
sudo python3 deploy/hubify-payment-evidence-cutover.py --dry-run \
  --candidate "$PRIVATE_PACKAGE" --candidate-sha256 "$PACKAGE_SHA256" \
  --source-sha "$PR56_SHA" --baseline-archive "$V180_PACKAGE"
sudo python3 deploy/hubify-payment-evidence-cutover.py --apply \
  --candidate "$PRIVATE_PACKAGE" --candidate-sha256 "$PACKAGE_SHA256" \
  --source-sha "$PR56_SHA" --baseline-archive "$V180_PACKAGE"
```

Dry-run does not acquire/create a lock, extract packages, save a journal, write
configuration, build, stop services or migrate. Apply holds the existing shared
operation lock and records every phase before mutation. No moving branch deploy.

## Capacity, credentials and quiescence

Four exact unused images for pre-v1.7.4 Hubify commits f7da54/f6ce29 were identified
by full digest and checked against all containers before non-force removal.
Current v1.8.0 app/tools and immediate rollback c67 app/tools remain available;
no platform images, volumes, data, media, configuration or backups were removed.
Free disk increased from 5,244,432,384 to 13,098,557,440 bytes. Every actual preflight
still enforces the original 6 GiB + twice persistent-data budget (2 GiB + data after
both images are prepared). No blanket prune or lowered capacity guard.

The root-only staged Google client is validated privately. The executor enrolls
only active Admin-role identities of this single installation and writes new
root-only private app/migration env files without overwriting differing existing
values. The encryption key is generated on-server once and backed up with tokens.
Client/key values stay outside source/build contexts, package, command arguments,
journal/Compose environment values, Git and stdout. Compose refers to private
env_file paths. No NEXT_PUBLIC secret, password, OTP or mailbox-body log.

The original Compose's services/sockets/media/proxy settings are preserved. Only
app/tools image/build references and public candidate identity change. J&T flags
must stay yes before and after. Payment provider remains manual. Pilot UI/API is
Admin-allowlisted; checkout and PAID/association actions stay off.

After build and a second fresh baseline check, stop the updater and maintenance
timer, wait for active maintenance/carrier work to drain, fence only Hubify's app
proxy handle, stop the app gracefully and verify DB writers are gone. Shared
platform/proxy routes remain preserved by exact reviewed proxy hashes.

While the updater is stopped, an exact additional journal check is inserted into
its existing operator guard (manager/updater engine bytes are separately pinned).
All surrounding worker bytes are preserved, compiled and backed up; before/after
hashes are journaled. This blocks worker updates on recovery/reboot until this
pilot journal is complete/rolled_back. The previous worker-upgrade receipt is not
rewritten. A future worker-code upgrade must review this supplemental guard receipt
rather than pretend the old receipt still describes the patched engine.

## Backup, migration and recovery

Use the existing `updater.backup()`/`verify_backup()` under the write fence. Verify
all DB/config/media digests, restore into a scratch DB and extract/verify media and
configuration before migrating. Backup path and verification are durable in
`/etc/single-store/hubify-payment-evidence-cutover.json`. No production DB restore.
The old app/tools image, Compose and published baseline package are retained.

Prisma migrate deploy runs in the bounded tools container. Its separate private
migration URLs include PostgreSQL session options lock_timeout=10s and
statement_timeout=90s; the unchanged runtime URLs do not. A local Prisma 5.22 probe
confirmed these actual backend settings. Never log these credential-bearing URLs.

After SQL, require exactly 32 complete migrations, the old complete ledger rows
unchanged, all existing public table-row hashes unchanged, exact projected schema
`72f1aa730f8c992605fba501f50ffb27e779dd7a786532904f0d6830aa46b02a`
and zero new evidence rows before traffic. Reference-table/financial hash snapshots
are computed server-side; private row contents are not emitted.

Only then activate the exact image, check health/source/private configuration/
carrier flags, update truthful candidate metadata, restore the app proxy and
resume workers. Source activation is still DB-prohibited. Final smoke must verify
admin access/denial, storefront/manual checkout and carrier configuration without
creating a payment or shipping transaction.

For interruption, inspect the root-only phase journal, running containers/build
and actual ledger first. The same exact candidate supports `--reconcile`. If a
build/backup client was interrupted, inspect daemon work and attest
`--external-work-stopped` only once it actually stopped. Partial/uncertain SQL keeps
the fence and requires operator review; do not rewrite the ledger, resolve a
migration or replay unknown SQL. A fully committed 32-state reconciles forward
without repeating migration. After traffic may have opened, preserve new orders
and never compare against/reinstate old row snapshots.

Code rollback differs from database restore. Added tables/index do not modify old
columns or rows, so the retained old image can ignore them, with the preview off.
If post-cutover recovery requires an old-image rollback, review current activity,
fence/drain again, retain all 32 ledger entries and new observations, restore only
the old image/Compose and truthful metadata. Do not automatically restore an old
DB/config backup over new transactions. Partial-migration states require forward
repair or separately approved loss/reconciliation planning, not old-binary guessing.

## Google readiness

Live Console inspection confirmed Gmail API Enabled, External/Testing audience,
and after the owner's action one enrolled Test user. No OAuth consent, mailbox
read or new transfer has yet been performed. Never publish the Google app merely
to avoid Testing limits. Owner consent uses the dashboard Google redirect after
the private pilot is live; no operator requests passwords/OTP or copies tokens.
