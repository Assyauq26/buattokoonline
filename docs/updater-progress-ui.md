# Worker progress indicator

The owner's real Gheverhan update job `afcd85bf808226586f52466dd5cd266f`
completed v1.8.0 -> v1.8.1 in 427 seconds on 13 November 2026. The app is
healthy, the ledger contains 31 migrations, the original 30 checksums match,
the exact published app source/archive match, a backup is recorded, external
work is settled and the scheduler resumed. No second app update was started.

The worker page previously showed only the stage heading, and incorrectly kept
the availability message “Update siap dipasang” while a job was building.
This worker-only revision adds an accessible black progress bar, an explicit
8-stage counter, build-stage explanation, last status timestamp and a separate
download ratio when actual byte totals are available. Busy/recovery messages
take precedence over the cached available-release label.

The overall bar measures completed stages, **not time, build percentage or ETA**.
At preparing it shows stage 3/8 with 2 completed stages; Docker build percentage
is unknown and is not invented. Success shows 8/8; recovery hides that bar rather
than claiming completion. No new polling endpoint or privileged action is added.
Cookie/Admin checks, CSP nonce, textContent rendering and private no-store
responses stay in place. Polling and all update/recovery behavior are unchanged.

Only the standalone worker UI changes. Published v1.8.1 tag/assets, app files,
schema, ledger and secrets are not changed. Deliver through the official pinned
worker-upgrade dry-run/apply path **after the active job has succeeded**. Do not
restart a busy worker to change the page. Prior source/receipt and route backups
remain retained, and the app/container identity and runtime/version hashes must
match before/after the worker revision.

Validation: 9 status/session/route tests, 8 runtime-directory cases (2 local
Linux-only skips covered by the previously tested helper), 9 installer tests,
and an offline real-browser test of preparing/downloading/migration/success/
recovery/reopen at 390/1440 px. The browser fixture performs no mutations and
connects to no shop. Screenshots and receipts accompany this change.
