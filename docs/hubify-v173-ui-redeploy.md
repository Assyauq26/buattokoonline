# Hubify-only PR #43 deployment proposal — awaiting approval

No deployment, merge, release, migration/ledger edit, or installation of this proposed helper has occurred. Hubify remains on v1.7.3 / b8b33ebecec3f1c9798b7148f0f407da142afb46. The request is to test the UI live on Hubify without publishing a release.

## Why the official helper currently refuses

Read-only preflight on the installed helper passes domain, completed journal, J&T test mode and ledger checks. check_schema against PR #43 aab952a39b0b7a4cf49b9647af04622bafb2e3f1 then rejects `Kompatibilitas migrasi historis tidak terverifikasi: 20261109120000_order_resolution_workflow`. The existing authorization intentionally permits only the original v1.7.2 → v1.7.3 transition, not redeployment from installed v1.7.3. PR #43 does not change migrations.

The official path in [hubify-staging.md](hubify-staging.md) deploys exact HEAD main using the root-owned helper and protected GitHub Environment; branch deployment is not supported. This proposal does not relax that boundary.

| Historical migration | Applied/ledger SHA-256 | Git/artifact SHA-256 | Applied bytes / Git bytes |
| --- | --- | --- | --- |
| 20261109120000_order_resolution_workflow | 789ef757b2cb2fb6f6d38f710c6a50cfcb371d9b61e18e4154120930e02107ac | 865ec38af4482060322ba0dc89becc9132881d7bbb7f7e633b669af30e0444ec | 3116 / 3097 |
| 20261109121500_resolution_transfer_review | d67b0094191575be2f28c7968e41eabad5bf9a9ab84676d8c66b7e7c01313483 | 22cb34b1d3840926b42356fb333c0678f5a0ea850ee3c3b8b1f9373cc92a885b | 356 / 354 |

For both files, VPS read-only comparison confirms Git bytes = untouched candidate bytes = original authenticated v1.7.2 artifact bytes; active runtime bytes = original applied bytes; SHA-256(active) = ledger; active.replace(CRLF, LF) = candidate. All 29 ledger checksums equal installed metadata. Original artifact SHA-256 remains dd7d400a3821e4fc20b6886f688ee48c46300a440344b0e06978e32313dad938. No historical SQL or Prisma ledger is changed by this PR.

## Narrow continuation

The additional authorization requires every existing audited condition plus all of:

- Installed v1.7.3 from exact source b8b33ebecec3f1c9798b7148f0f407da142afb46, channel hubify-staging, candidate_version 1.7.3.
- Exact same known Hubify installation/origin, database contract, archive hash/manifest, full applied migration inventory, and the two known raw checksum pairs.
- Candidate VERSION 1.7.3 and complete committed app tree 79de568eb19b30baaefe99b2023500aa7ceab82d, the UI from PR #43. validate_source derives this tree from Git HEAD:app, not operator input. A new merge commit with the same app tree is allowed; other app changes fail closed.

The regular updater package extraction does not supply this tree and cannot use the continuation. The original v1.7.2 path remains unchanged. After deployment changes installed source_sha, another different deployment again requires review. Existing runtime projection remains confined to a new deployment checkout, preserving applied bytes without changing original source, artifact or ledger. Effective inventory and audit records retain applied checksums.

## Shared proxy protection

Read-only inspection found that the active Caddyfile also contains the local updater status route and the central platform domain. The old whole-file generator would remove these. Prefix-only preservation was rejected in testing because Hubify itself has a custom updater route.

The proposed helper pins the entire audited Caddyfile instead:

- Live SHA-256: d9bcf3dffdf41abfb3500f9f3b0f002ff175fb8b742639a4539569610e6e7852.
- Maintenance SHA-256: fad40745569a46024700b1bab66043fb5b15aabf15f003a5324c22c63dbb4023.
- Only the single exact app:3000 fallback handle changes to/from the existing maintenance response. Output must match the corresponding approved whole-file hash. Every other byte, including custom Hubify routes, platform sites, comments and whitespace, is preserved.
- Missing file, symlink, unknown checksum, ambiguous handle, or unexpected output refuses before writing. preflight checks the current proxy before creating a deployment journal or stopping the app. The same preservation parameters flow through deploy, recovery and rollback. The bind-mounted inode is retained.
- Normal installer/updater rendering defaults are unchanged; preservation is explicitly selected by the Hubify helper.

## Verification

- 76 installer/updater/historical/helper tests PASS on Linux in an ephemeral container with no network, no production mounts, read-only source mount, 0.5 CPU / 256 MB. Includes six new authorization/negative/projection cases and four proxy preservation cases, plus existing regression tests.
- Six deploy compatibility/rollback tests PASS in the same isolated environment.
- Proposed helper preflight + schema check PASS read-only against the actual installed metadata and untouched PR #43 candidate: 29 effective migrations match ledger. Proposed live Caddy output equals the active file byte-for-byte; maintenance output differs only by the single app handle.
- Before/after SHA-256 equality verified for installed helper, manager core/updater/historical modules, version metadata, Compose and Caddyfile; ledger re-read is unchanged. No proposal file was installed in /opt/single-store/manager or /usr/local/sbin.
- Windows cannot run the Linux helper fcntl test; an initial Alpine test container lacked openssl. The complete rerun used the existing Linux test image with openssl and passed. No tests were skipped to claim PASS.
- UI validation remains in PR #43 (636 unit / 21 DB / 20 browser checks, typecheck/lint/build). This PR has no app, VERSION, release-policy, migration, schema or release artifact changes. CI is not requested; commits use [skip ci].

## Activation after explicit review/approval

1. Recheck installed source SHA, all preflight pins, PR heads, current main and shared proxy hash. If anything changed, stop and re-review. Do not add other agents' changes to the app tree.
2. Integrate PR #43 and this separate helper PR into main. Confirm HEAD:app still equals the pinned UI tree. No tag, GitHub Release, updater catalog or fleet rollout.
3. Back up root-owned helper and manager core.py/updater.py/historical_migrations.py to a private timestamped directory. Syntax-check the reviewed main versions; install these four files together with existing owner/modes, preserving the standalone helper's executable bit. Do not overwrite historical migration files or ledger. Retain backups for operator recovery.
4. Rerun official preflight/schema/ledger/proxy checks. Dispatch deploy-hubify.yml for exact main SHA. Keep the protected hubify-staging Environment reviewer requirement; do not bypass it via operator SSH. Helper retains operation lock, full backup, schema validation, build, migration, health and rollback.
5. After approval and successful deployment, verify exact live SHA, readiness, seller editor and both Hubify/platform routes, then recheck proxy checksum, ledger and preserved integrations. Give the user the live editor URL for manual testing. Do not publish a release.

Approval is requested for this concrete safety-helper change and main integration needed for the authorized Hubify-only deployment. Until then the deployment remains NO-GO, and the installed helper/runtime remains unchanged.
